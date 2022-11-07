// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../types/globals.d.ts" />

import { iterateOpTree } from './common/iterate-operation-tree';
import type { WorkerRequest, WorkerOperation } from './common/WorkerRequest';
import type { WorkerResponse, WorkerResult, WorkerIDMap } from './common/WorkerResponse';

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

function evaluateOpTree(tree: WorkerOperation): WorkerResult {
    const manifold = manifoldModule as ManifoldStatic;
    const stack = new Array<Manifold>();
    let result: WorkerResult | undefined = undefined;
    const idMap: WorkerIDMap = [];

    iterateOpTree(tree, (_context, _key, [meshID, mesh]) => {
        // mesh
        const meshManif = new manifold.Manifold(mesh);
        idMap.push([meshManif.originalID(), meshID]);
        stack.push(meshManif);
    }, (_context, _key, node) => {
        // primitive
        switch (node.primitive) {
            case 'cube':
                stack.push(manifold.cube(
                    node.size, node.center
                ));
                break;
            case 'cylinder':
                stack.push(manifold.cylinder(
                    node.height, node.radiusLow, node.radiusHigh,
                    node.circularSegments, node.center
                ));
                break;
            case 'sphere':
                stack.push(manifold.sphere(
                    node.radius, node.circularSegments
                ));
                break;
            case 'tetrahedron':
                stack.push(manifold.tetrahedron());
                break;
            default:
                throw new Error(`Unknown primitive: ${(node as {primitive: string}).primitive}`);
        }
    }, (_context, _key, node) => {
        // operation
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

                    for (let i = 0; i < wantedCount; i++) {
                        const next = stack.pop();
                        if (next === undefined) {
                            throw new Error(`Expected ${wantedCount} manifolds in the stack, got ${i}`);
                        }

                        manifolds.push(next);
                    }

                    stack.push(opFunc(manifolds));
                } else {
                    if (stack.length < 2) {
                        throw new Error(`Expected 2 manifolds in the stack, got ${stack.length}`);
                    }

                    stack.push(opFunc(
                        stack.pop() as Manifold,
                        stack.pop() as Manifold
                    ));
                }

                break;
            }
            case 'translate':
            case 'rotate':
            case 'scale':
            case 'transform':
            case 'refine':
            case 'asOriginal': {
                if (stack.length !== 1) {
                    throw new Error('Expected 1 manifold on the stack, got none');
                }

                const top = stack.pop() as Manifold;
                let res: Manifold;

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

                stack.push(res);
                break;
            }
            case 'extrude':
                stack.push(manifold.extrude(
                    node.crossSection, node.height, node.nDivisions,
                    node.twistDegrees, node.scaleTop
                ));
                break;
            case 'revolve':
                stack.push(manifold.revolve(
                    node.crossSection, node.circularSegments
                ));
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
    }, (_context, _key, root) => {
        // top operation
        if (stack.length !== 1) {
            throw new Error('Expected 1 manifold on the stack, got none');
        }
        if (result !== undefined) {
            throw new Error('Expected no current result, but result was already set');
        }

        const top = stack.pop() as Manifold;
        switch (root.operation) {
            case 'isEmpty':
                result = top.isEmpty();
                break;
            case 'numVert':
                result = top.numVert();
                break;
            case 'numTri':
                result = top.numTri();
                break;
            case 'numEdge':
                result = top.numEdge();
                break;
            case 'boundingBox':
                result = top.boundingBox();
                break;
            case 'precision':
                result = top.precision();
                break;
            case 'genus':
                result = top.genus();
                break;
            case 'getProperties':
                result = top.getProperties();
                break;
            case 'getCurvature':
                result = top.getCurvature();
                break;
            case 'originalID':
                result = top.originalID();
                break;
            default:
                throw new Error(`Unknown top operation: ${(root as {operation: string}).operation}`);
        }
    });

    if (result === undefined) {
        if (stack.length === 1) {
            return [ stack[0].getMesh(), stack[0].getMeshRelation(), idMap ];
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
                    logWorker(console.debug, `Initializing worker with libary path "${message.data.libraryPath}"`);
                    importScripts(message.data.libraryPath);
                    logWorker(console.debug, `Imported library successfuly`);
                    manifoldModule = await Module();
                    logWorker(console.debug, `Done waiting for module`);
                    manifoldModule.setup();
                    logWorker(console.debug, `Module setup finished`);
                } catch(error) {
                    // TODO clean up module properly
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
            // TODO clean up module properly
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

            try {
                postMessage(<WorkerResponse>{
                    type: 'result',
                    success: true,
                    jobID: message.data.jobID,
                    result: evaluateOpTree(message.data.operation),
                });
            } catch(error) {
                logWorker(console.debug, `Job ${message.data.jobID} failed`);
                logWorker(console.error, error);
                postMessage(<WorkerResponse>{
                    type: 'result',
                    success: false,
                    jobID: message.data.jobID,
                    error,
                });
                return;
            }

            logWorker(console.debug, `Job ${message.data.jobID} finished`);
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