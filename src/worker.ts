import { iterateOpTree } from './common/iterate-operation-tree';
import ManifoldModule, { Vec3 } from 'manifold-3d';
import { WorkerResultType } from './common/WorkerResponse';
import { MeshAttribute } from '@wonderlandengine/api';
import { getComponentCount } from './common/getComponentCount';

import type { WorkerRequest, WorkerOperation } from './common/WorkerRequest';
import type { WorkerResponse, WorkerResult, WorkerResultPassthroughValue } from './common/WorkerResponse';
import type { ManifoldStatic, Manifold } from 'manifold-3d';
import type { EncodedMeshGroup } from './common/EncodedMeshGroup';
import type { AllowedExtraMeshAttribute } from './common/AllowedExtraMeshAttribute';
import { EncodedSubmesh } from './common/EncodedSubmesh';
import { getIndexBufferType, makeIndexBuffer, makeIndexBufferForType } from './client';
import { DynamicArray } from './common/DynamicArray';

function logWorker(callback: (message: string) => void, message: unknown) {
    callback(`[Worker ${self.name}] ${message}`);
}

let globalManifoldModule: ManifoldStatic | null = null;

const boolOpMap: Record<string, 'union' | 'difference' | 'intersection'> = {
    add: 'union',
    union: 'union',
    subtract: 'difference',
    difference: 'difference',
    intersect: 'intersection',
    intersection: 'intersection',
};

function evaluateOpTree(manifoldModule: ManifoldStatic, tree: WorkerOperation, transfer: Array<Transferable>, allocatedManifolds: Array<Manifold>): WorkerResult {
    // create a common mapping for MeshGroup extra mesh attributes
    const attributeMapping = new Array<[attrType: AllowedExtraMeshAttribute, offset: number, componentSize: number]>();
    let numProp = 3;
    iterateOpTree(tree, (_context, _key, encodedMeshGroup) => {
        for (const submesh of encodedMeshGroup.submeshes) {
            for (const [attrType, _attrArray] of submesh.extraAttributes) {
                let found = false;
                for (const [oAttrType, _oOffset] of attributeMapping) {
                    if (attrType === oAttrType) {
                        found = true;
                        break;
                    }
                }

                if (found) {
                    continue;
                }

                const componentSize = getComponentCount(attrType);
                attributeMapping.push([attrType, numProp, componentSize]);
                numProp += componentSize;
            }
        }
    });

    const commonAttrCount = attributeMapping.length;

    // evaluate operation tree
    const stack = new Array<Manifold>();
    let result: WorkerResult | undefined = undefined;
    const materialMap = new Map<number, number>();
    const wantedExtraAttributes = new Map<number, Array<number>>();

    iterateOpTree(tree, (_context, _key, encodedMeshGroup) => {
        // meshgroup
        // logWorker(console.debug, 'Adding mesh as manifold to stack');

        // convert encoded meshgroup to manifold
        const submeshes = encodedMeshGroup.submeshes;
        const submeshCount = submeshes.length;
        const originalIDStart = submeshCount > 0 ? manifoldModule.reserveIDs(submeshCount) : null;
        let mergeFromVert: Uint32Array | undefined;
        let mergeToVert: Uint32Array | undefined;
        let runOriginalID: Uint32Array | undefined;
        let runIndex: Uint32Array | undefined;
        let vertProperties: Float32Array;
        let triVerts: Uint32Array;

        if (originalIDStart !== null) {
            // calculate total vertex/index count
            let totalVertexCount = 0;
            let totalIndexCount = 0;
            for (const submesh of submeshes) {
                const vertexCount = submesh.positions.length / 3;
                totalVertexCount += vertexCount;
                const indices = submesh.indices;
                totalIndexCount += indices === null ? vertexCount : indices.length;
            }

            // convert to buffers usable by MeshJS
            vertProperties = new Float32Array(totalVertexCount * numProp);
            triVerts = new Uint32Array(totalIndexCount);
            runOriginalID = new Uint32Array(submeshCount);
            let indexOffset = 0;
            let vertexOffset = 0;

            for (let i = 0; i < submeshCount; i++) {
                // save manifold ids and map manifold ids back to material ids
                const encodedSubmesh = submeshes[i];
                const originalID = originalIDStart + i;
                const materialID = encodedSubmesh.materialID;
                runOriginalID[i] = originalID;

                if (materialID !== null) {
                    materialMap.set(originalID, materialID);
                }

                // save wanted attributes
                const wanted = new Array<number>();
                for (const [attrType, _attrArray] of encodedSubmesh.extraAttributes) {
                    for (let a = 0; a < commonAttrCount; a++) {
                        const oAttrType = attributeMapping[a][0];
                        if (attrType === oAttrType) {
                            wanted.push(a);
                            break;
                        }
                    }
                }

                wantedExtraAttributes.set(originalID, wanted);

                // store indices in common mesh. if mesh is not indexed, make
                // it. move index offset too
                const indices = encodedSubmesh.indices;
                const positions = encodedSubmesh.positions;
                const posCompCount = positions.length;
                const vertexCount = posCompCount / 3;

                if (indices === null) {
                    for (let j = 0; j < vertexCount; j++) {
                        triVerts[indexOffset + j] = vertexOffset + j;
                    }

                    indexOffset += vertexCount;
                } else {
                    const indexCount = indices.length;
                    for (let j = 0; j < indexCount; j++) {
                        triVerts[indexOffset + j] = vertexOffset + indices[j];
                    }

                    indexOffset += indices.length;
                }

                // interlace positions into common mesh
                for (let j = 0, offset = vertexOffset; j < posCompCount; offset += numProp) {
                    vertProperties[offset    ] = positions[j++];
                    vertProperties[offset + 1] = positions[j++];
                    vertProperties[offset + 2] = positions[j++];
                }

                // interlace extra attributes into common mesh
                for (const [attrType, attrArray] of encodedSubmesh.extraAttributes) {
                    // get per-vertex offset of attribute type
                    let attrOffset: number | null = null;
                    let attrCompSize: number | null = null;
                    for (const [oAttrType, oAttrOffset, oAttrCompSize] of attributeMapping) {
                        if (attrType === oAttrType) {
                            attrOffset = oAttrOffset;
                            attrCompSize = oAttrCompSize;
                            break;
                        }
                    }

                    if (attrOffset === null || attrCompSize === null) {
                        throw new Error(`Unexpected missing attribute type ID ${attrType}, which should have been previously mapped. This is a bug, please report it`);
                    }

                    // interlace
                    const attrArrayLen = attrArray.length;
                    for (let j = 0, offset = vertexOffset + attrOffset; j < attrArrayLen; offset += numProp) {
                        for (let k = 0; k < attrCompSize; k++) {
                            vertProperties[offset + k] = attrArray[j++];
                        }
                    }
                }

                // move vertex offset
                vertexOffset += vertexCount;
            }

            // extract merge map
            if (encodedMeshGroup.mergeMap) {
                [mergeFromVert, mergeToVert] = encodedMeshGroup.mergeMap;
            }
        } else {
            // empty mesh
            vertProperties = new Float32Array();
            triVerts = new Uint32Array();
        }

        // convert meshgroup -> meshjs -> manifold
        const mesh = new manifoldModule.Mesh({
            numProp, vertProperties, triVerts, runIndex, runOriginalID,
            mergeFromVert, mergeToVert
        });

        const meshManif = new manifoldModule.Manifold(mesh);
        allocatedManifolds.push(meshManif);
        stack.push(meshManif);
    }, (_context, _key, node) => {
        // primitive
        // logWorker(console.debug, `Adding primitive (${node.primitive}) to stack`);
        let primitiveManifold: Manifold;

        switch (node.primitive) {
            case 'cube':
                primitiveManifold = manifoldModule.cube(
                    node.size, node.center
                );
                break;
            case 'cylinder':
                primitiveManifold = manifoldModule.cylinder(
                    node.height, node.radiusLow, node.radiusHigh,
                    node.circularSegments, node.center
                );
                break;
            case 'sphere':
                primitiveManifold = manifoldModule.sphere(
                    node.radius, node.circularSegments
                );
                break;
            case 'tetrahedron':
                primitiveManifold = manifoldModule.tetrahedron();
                break;
            default:
                throw new Error(`Unknown primitive: ${(node as {primitive: string}).primitive}`);
        }

        allocatedManifolds.push(primitiveManifold);
        stack.push(primitiveManifold);
    }, (_context, _key, node) => {
        // operation
        // logWorker(console.debug, `Starting operation (${node.operation})...`);
        let res: Manifold;

        switch (node.operation) {
            case 'add':
            case 'union':
            case 'subtract':
            case 'difference':
            case 'intersect':
            case 'intersection': {
                const opFunc = manifoldModule[boolOpMap[node.operation]];

                if ('manifolds' in node) {
                    const wantedCount = node.manifolds.length;
                    const manifolds = new Array<Manifold>();

                    // logWorker(console.debug, `Popping ${wantedCount} manifolds, pushing 1`);

                    for (let i = 0; i < wantedCount; i++) {
                        const next = stack.pop();
                        if (next === undefined) {
                            throw new Error(`Expected ${wantedCount} manifolds in the stack, got ${i}`);
                        }

                        manifolds.push(next);
                    }

                    res = opFunc(manifolds);
                } else {
                    // logWorker(console.debug, 'Popping 2 manifolds, pushing 1');

                    if (stack.length < 2) {
                        throw new Error(`Expected at least 2 manifolds in the stack, got ${stack.length}`);
                    }

                    res = opFunc(
                        stack.pop() as Manifold,
                        stack.pop() as Manifold
                    );
                }
                break;
            }
            case 'translate':
            case 'rotate':
            case 'scale':
            case 'transform':
            case 'refine':
            case 'asOriginal': {
                // logWorker(console.debug, 'Popping 1 manifold, pushing 1');

                if (stack.length < 1) {
                    throw new Error(`Expected at least 1 manifold on the stack, got ${stack.length}`);
                }

                const top = stack.pop() as Manifold;
                switch(node.operation) {
                    case 'translate':
                        res = top.translate(node.offset);
                        break;
                    case 'rotate':
                        res = top.rotate(node.degrees);
                        break;
                    case 'scale':
                        res = top.scale(node.factor);
                        break;
                    case 'transform':
                        res = top.transform(node.matrix);
                        break;
                    case 'refine':
                        res = top.refine(node.splits);
                        break;
                    case 'asOriginal':
                        res = top.asOriginal();
                }

                break;
            }
            case 'extrude':
                // logWorker(console.debug, 'Pushing 1 manifold');

                res = manifoldModule.extrude(
                    node.crossSection, node.height, node.nDivisions,
                    node.twistDegrees, node.scaleTop
                );
                break;
            case 'revolve':
                // logWorker(console.debug, 'Pushing 1 manifold');

                res = manifoldModule.revolve(
                    node.crossSection, node.circularSegments
                );
                break;
            default: {
                // XXX fighting the type system again...
                const op = (node as {operation: string}).operation;
                if (op === 'compose' || op === 'decompose') {
                    throw new Error(`${op} operation is not implemented yet`);
                } else {
                    throw new Error(`Unknown operation: ${op}`);
                }
            }
        }

        allocatedManifolds.push(res);
        stack.push(res);

        // logWorker(console.debug, 'Operation finished');
    }, (_context, _key, root) => {
        // logWorker(console.debug, 'Top operation. Popping 1 manifold');
        // top operation
        if (stack.length !== 1) {
            throw new Error(`Expected 1 manifold on the stack, got ${stack.length}`);
        }
        if (result !== undefined) {
            throw new Error('Expected no current result, but result was already set');
        }

        const top = stack.pop() as Manifold;
        let resValue: WorkerResultPassthroughValue;
        switch (root.operation) {
            case 'isEmpty':
                resValue = top.isEmpty();
                break;
            case 'numVert':
                resValue = top.numVert();
                break;
            case 'numTri':
                resValue = top.numTri();
                break;
            case 'numEdge':
                resValue = top.numEdge();
                break;
            case 'boundingBox':
                resValue = top.boundingBox();
                break;
            case 'precision':
                resValue = top.precision();
                break;
            case 'genus':
                resValue = top.genus();
                break;
            case 'getProperties':
                resValue = top.getProperties();
                break;
            case 'getCurvature':
                resValue = top.getCurvature();
                break;
            case 'originalID':
                resValue = top.originalID();
                break;
            default:
                throw new Error(`Unknown top operation: ${(root as {operation: string}).operation}`);
        }

        result = [WorkerResultType.Passthrough, resValue];
    });

    if (result === undefined) {
        if (stack.length === 1) {
            // convert manifold -> meshjs, and transform normals
            let normalIdx: Vec3 | undefined;
            for (const [attrType, attrOffset, _attrCompSize] of attributeMapping) {
                if (attrType === MeshAttribute.Normal) {
                    normalIdx = [attrOffset, attrOffset + 1, attrOffset + 2];
                    break;
                }
            }

            const top = stack[0];
            const outMesh = top.getMesh(normalIdx);

            // unpack meshjs
            const runOriginalID = outMesh.runOriginalID;
            if (runOriginalID === undefined) {
                throw new Error('Missing runOriginalID in resulting MeshJS object');
            }

            const runIndex = outMesh.runIndex;
            if (runIndex === undefined) {
                throw new Error('Missing runIndex in resulting MeshJS object');
            }

            const runTransform = outMesh.runTransform;
            if (runTransform === undefined) {
                throw new Error('Missing runTransform in resulting MeshJS object');
            }

            const triVerts = outMesh.triVerts;
            const outNumProp = outMesh.numProp;
            const vertProperties = outMesh.vertProperties;

            // extract merge map if present
            let mergeMap: [from: Uint32Array, to: Uint32Array] | null = null;
            if (outMesh.mergeFromVert && outMesh.mergeToVert) {
                mergeMap = [outMesh.mergeFromVert, outMesh.mergeToVert];
            }

            // deinterlace meshjs -> encodedmeshgroup
            const submeshes = new Array<EncodedSubmesh>();
            const submeshCount = runOriginalID.length;

            for (let m = 0; m < submeshCount; m++) {
                // get material mapped to this run (submesh)
                const originalID = runOriginalID[m];
                const materialID = materialMap.get(originalID) ?? null;

                // get list of vertices, and convert index buffer to usable
                // format
                const runStart = runIndex[m];
                const runEnd = runIndex[m + 1];
                const runLength = runEnd - runStart;
                const vertexOffsetMap = new DynamicArray(Uint32Array);
                // XXX this index buffer is not 100% efficient, hence why it's
                // called the transitory index buffer; it will be converted to
                // the final, more efficient form later (unless the target type
                // matches)
                const [transIndexBuffer, transIndexBufferType] = makeIndexBuffer(runLength, runLength);

                for (let i = 0; i < runLength; i++) {
                    const iManif = triVerts[runStart + i];
                    let newIndex = vertexOffsetMap.indexOf_guarded(iManif);

                    if (newIndex < 0) {
                        newIndex = vertexOffsetMap.length;
                        vertexOffsetMap.expandCapacity_guarded(newIndex + 1);
                        vertexOffsetMap.pushBack_guarded(iManif);
                    }

                    transIndexBuffer[i] = newIndex;
                }

                // optimise index buffer
                const vertexCount = vertexOffsetMap.length;
                const optimalIndexBufferType = getIndexBufferType(vertexCount);
                let indices = transIndexBuffer;
                if (optimalIndexBufferType !== transIndexBufferType) {
                    indices = makeIndexBufferForType(runLength, optimalIndexBufferType);
                    indices.set(transIndexBuffer);
                }

                // deinterlace position
                const positions = new Float32Array(vertexCount * 3);
                for (let i = 0, o = 0; i < vertexCount; i++) {
                    let iManif = vertexOffsetMap.get_guarded(i) * outNumProp;
                    positions[o++] = vertProperties[iManif++];
                    positions[o++] = vertProperties[iManif++];
                    positions[o++] = vertProperties[iManif];
                }

                // deinterlace extra attributes
                const submeshWantedExtra = wantedExtraAttributes.get(originalID);
                if (submeshWantedExtra === undefined) {
                    throw new Error('Mesh has no wanted extra attributes list. This is a bug, please report it');
                }

                const extraAttributes = new Array<[AllowedExtraMeshAttribute, Float32Array]>();
                for (const a of submeshWantedExtra) {
                    const [attrType, attrOffset, attrCompSize] = attributeMapping[a];
                    const attrArray = new Float32Array(vertexCount * attrCompSize);

                    for (let i = 0, o = 0; i < vertexCount; i++) {
                        let iManif = vertexOffsetMap.get_guarded(i) * outNumProp + attrOffset;
                        for (let j = 0; j < attrCompSize; j++) {
                            attrArray[o++] = vertProperties[iManif++];
                        }
                    }

                    extraAttributes.push([attrType, attrArray]);
                }

                // make encoded submesh
                submeshes.push({ indices, positions, extraAttributes, materialID });
            }

            // done
            return [WorkerResultType.MeshGroup, { mergeMap, submeshes }];
        } else {
            throw new Error(`Unexpected number of manifolds in stack (${stack.length}) after evaluation`);
        }
    } else {
        if (stack.length === 0) {
            return result;
        } else {
            throw new Error("Manifolds stack expected to be empty, but isn't");
        }
    }
}

globalThis.onmessage = async function(message: MessageEvent<WorkerRequest>) {
    switch(message.data.type) {
        case 'initialize':
            if (!globalManifoldModule) {
                try {
                    // XXX we are now bundling instead of importing because
                    // manifold is an es6 module, and firefox doesnt support
                    // importing es6 modules in workers. it will be added in
                    // firefox 111, but we still need some reverse compatibility
                    // instead of just supporting the bleeding edge
                    logWorker(console.debug, 'Initializing worker'); // `Initializing worker with libary path "${message.data.libraryPath}"`
                    // importScripts(message.data.libraryPath);
                    // logWorker(console.debug, `Imported library successfuly`);
                    globalManifoldModule = await ManifoldModule();
                    logWorker(console.debug, `Done waiting for module`);
                    globalManifoldModule.setup();
                    logWorker(console.debug, `Module setup finished`);
                } catch(error) {
                    // XXX not sure what else can be done to clean up
                    globalManifoldModule = null;
                    logWorker(console.debug, 'Initialization failed');
                    logWorker(console.error, error);
                    postMessage(<WorkerResponse>{ type: 'crash', error });
                    return;
                }
            }

            logWorker(console.debug, 'Ready');
            postMessage(<WorkerResponse>{ type: 'ready' });
            return;
        case 'terminate':
            // XXX not sure what else can be done to clean up
            globalManifoldModule = null;
            logWorker(console.debug, 'Terminated');
            postMessage(<WorkerResponse>{ type: 'terminated' });
            return;
        case 'operation': {
            if (!globalManifoldModule) {
                postMessage(<WorkerResponse>{
                    type: 'result',
                    success: false,
                    jobID: message.data.jobID,
                    error: 'Worker is not ready yet'
                });
                return;
            }

            logWorker(console.debug, `Job ${message.data.jobID} started`);
            const allocatedManifolds = new Array<Manifold>();

            try {
                const transfer = new Array<Transferable>();
                const result = evaluateOpTree(
                    globalManifoldModule,
                    message.data.operation,
                    transfer,
                    allocatedManifolds
                );

                postMessage(<WorkerResponse>{
                    type: 'result',
                    success: true,
                    jobID: message.data.jobID,
                    result,
                }, transfer);

                logWorker(console.debug, `Job ${message.data.jobID} finished`);
            } catch(error) {
                logWorker(console.debug, `Job ${message.data.jobID} failed`);
                logWorker(console.error, error);
                postMessage(<WorkerResponse>{
                    type: 'result',
                    success: false,
                    jobID: message.data.jobID,
                    error,
                });
            }

            // free allocated manifold objects
            for (const manifold of allocatedManifolds) {
                // FIXME fix manifold type definitions file to have delete()
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                manifold.delete();
            }

            return;
        }
        default: {
            // XXX fighting the type system again...
            const type = (message.data as {type: string}).type;
            const error = `Unknown worker request type: ${type}`;
            logWorker(console.error, error);
            postMessage(<WorkerResponse>{ type: 'crash', error });
        }
    }
}

logWorker(console.debug, 'Created');
postMessage(<WorkerResponse>{ type: 'created' });