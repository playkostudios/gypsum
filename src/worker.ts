import { iterateOpTree } from './common/iterate-operation-tree';
import ManifoldModule from 'manifold-3d';
import { WorkerResultType } from './common/WorkerResponse';

import type { WorkerRequest, WorkerOperation } from './common/WorkerRequest';
import type { WorkerResponse, WorkerResult, WorkerResultPassthroughValue } from './common/WorkerResponse';
import type { ManifoldStatic, Manifold } from 'manifold-3d';
import type { EncodedMeshGroup } from './common/EncodedMeshGroup';

function logWorker(callback: (message: string) => void, message: unknown) {
    callback(`[Worker ${self.name}] ${message}`);
}

let manifoldModule: ManifoldStatic | null = null;

const boolOpMap: Record<string, 'union' | 'difference' | 'intersection'> = {
    add: 'union',
    union: 'union',
    subtract: 'difference',
    difference: 'difference',
    intersect: 'intersection',
    intersection: 'intersection',
};

function evaluateOpTree(tree: WorkerOperation, transfer: Array<Transferable>, allocatedManifolds: Array<Manifold>): WorkerResult {
    const manifold = manifoldModule as ManifoldStatic;
    const stack = new Array<Manifold>();
    let result: WorkerResult | undefined = undefined;
    const idMap = new Map<number, number>();

    iterateOpTree(tree, (_context, _key, encodedMeshGroup) => {
        // mesh
        // logWorker(console.debug, 'Adding mesh as manifold to stack');

        // TODO
        const originalID = manifold.reserveIDs(1);
        const mesh = new manifold.Mesh({
            numProp: 3,
            vertProperties: meshObj.vertPos,
            triVerts: meshObj.triVerts,
            runOriginalID: new Uint32Array([originalID]),
        });

        const meshManif = new manifold.Manifold(mesh);
        allocatedManifolds.push(meshManif);
        idMap.set(originalID, meshID);
        stack.push(meshManif);
    }, (_context, _key, node) => {
        // primitive
        // logWorker(console.debug, `Adding primitive (${node.primitive}) to stack`);
        let primitiveManifold: Manifold;

        switch (node.primitive) {
            case 'cube':
                primitiveManifold = manifold.cube(
                    node.size, node.center
                );
                break;
            case 'cylinder':
                primitiveManifold = manifold.cylinder(
                    node.height, node.radiusLow, node.radiusHigh,
                    node.circularSegments, node.center
                );
                break;
            case 'sphere':
                primitiveManifold = manifold.sphere(
                    node.radius, node.circularSegments
                );
                break;
            case 'tetrahedron':
                primitiveManifold = manifold.tetrahedron();
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
                const opFunc = manifold[boolOpMap[node.operation]];

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

                res = manifold.extrude(
                    node.crossSection, node.height, node.nDivisions,
                    node.twistDegrees, node.scaleTop
                );
                break;
            case 'revolve':
                // logWorker(console.debug, 'Pushing 1 manifold');

                res = manifold.revolve(
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
            const top = stack[0];
            const outMesh = top.getMesh();

            const faceID = outMesh.faceID;
            if (faceID === undefined) {
                throw new Error('Missing faceID in resulting MeshJS object');
            }

            const runIndex = outMesh.runIndex;
            if (runIndex === undefined) {
                throw new Error('Missing runIndex in resulting MeshJS object');
            }

            const runOriginalID = outMesh.runOriginalID;
            if (runOriginalID === undefined) {
                throw new Error('Missing runOriginalID in resulting MeshJS object');
            }

            const runTransform = outMesh.runTransform;
            if (runTransform === undefined) {
                throw new Error('Missing runTransform in resulting MeshJS object');
            }

            const meshCount = runOriginalID.length;
            const runMappedID = new Uint32Array(meshCount);
            for (let i = 0; i < meshCount; i++) {
                const originalID = runOriginalID[i];
                const meshID = idMap.get(originalID);
                if (meshID === undefined) {
                    // XXX should there be a fallback to null or something, and
                    // use plain arrays instead of uint32array?
                    throw new Error(`originalID ${originalID} has no mapped meshID`);
                }

                runMappedID[i] = meshID;
            }

            transfer.push(outMesh.triVerts.buffer);
            transfer.push(outMesh.vertProperties.buffer);
            transfer.push(faceID.buffer);
            transfer.push(runIndex.buffer);
            transfer.push(runMappedID.buffer);
            transfer.push(runTransform.buffer);
            // TODO generate encoded meshgroup
            const meshGroup: EncodedMeshGroup = null;

            return [WorkerResultType.MeshGroup, meshGroup];
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
            if (!manifoldModule) {
                try {
                    // XXX we are now bundling instead of importing because
                    // manifold is an es6 module, and firefox doesnt support
                    // importing es6 modules in workers. it will be added in
                    // firefox 111, but we still need some reverse compatibility
                    // instead of just supporting the bleeding edge
                    logWorker(console.debug, 'Initializing worker'); // `Initializing worker with libary path "${message.data.libraryPath}"`
                    // importScripts(message.data.libraryPath);
                    // logWorker(console.debug, `Imported library successfuly`);
                    manifoldModule = await ManifoldModule();
                    logWorker(console.debug, `Done waiting for module`);
                    manifoldModule.setup();
                    logWorker(console.debug, `Module setup finished`);
                } catch(error) {
                    // XXX not sure what else can be done to clean up
                    manifoldModule = null;
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
            manifoldModule = null;
            logWorker(console.debug, 'Terminated');
            postMessage(<WorkerResponse>{ type: 'terminated' });
            return;
        case 'operation': {
            if (!manifoldModule) {
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
                const result = evaluateOpTree(message.data.operation, transfer, allocatedManifolds);
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