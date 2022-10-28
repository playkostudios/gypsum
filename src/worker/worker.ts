import { CSGOperation } from '../common/CSGOperation';
import { CSGTree } from '../common/CSGTree';
import WorkerRequest from './WorkerRequest';
import WorkerResponse from './WorkerResponse';

function getManifold(manifold: unknown, input: Manifold | Mesh | CSGTree<Mesh>): Manifold {
    if (input instanceof Manifold) {
        return input;
    } else if ('vertPos' in input) {
        return new manifold.Manifold(input);
    } else {
        return doOperation(manifold, input);
    }
}

function getManifolds(manifold: unknown, inputs: Array<Manifold | Mesh | CSGTree<Mesh>>): Array<Manifold> {
    return inputs.map(input => getManifold(manifold, input));
}

const boolOpMap: Record<string, 'union' | 'difference' | 'intersection'> = {
    add: 'union',
    union: 'union',
    subtract: 'difference',
    difference: 'difference',
    intersect: 'intersection',
    intersection: 'intersection',
};

function doOperation(manifold: unknown, csgTree: CSGTree<Mesh>): Manifold {
    if ('primitive' in csgTree) {
        // primitive
        switch (csgTree.primitive) {
        case 'cube':
            return (manifold as ManifoldStatic).cube(
                csgTree.size, csgTree.center
            );
        case 'cylinder':
            return (manifold as ManifoldStatic).cylinder(
                csgTree.height, csgTree.radiusLow, csgTree.radiusHigh,
                csgTree.circularSegments, csgTree.center
            );
        case 'sphere':
            return (manifold as ManifoldStatic).sphere(
                csgTree.radius, csgTree.circularSegments
            );
        case 'tetrahedron':
            return (manifold as ManifoldStatic).tetrahedron();
        default:
            throw new Error(`Unknown primitive: ${csgTree.primitive}`);
        }
    } else {
        // operation
        switch (csgTree.operation) {
        case 'add':
        case 'union':
        case 'subtract':
        case 'difference':
        case 'intersect':
        case 'intersection':
        {
            const opFunc = (manifold as ManifoldStatic)[boolOpMap[csgTree.operation]];

            if ('manifolds' in csgTree) {
                return opFunc(getManifolds(manifold, csgTree.manifolds));
            } else {
                return opFunc(
                    getManifold(manifold, csgTree.left),
                    getManifold(manifold, csgTree.right)
                );
            }
        }
        case 'translate':
            return getManifold(manifold, csgTree.manifold).translate(csgTree.offset);
        case 'rotate':
            return getManifold(manifold, csgTree.manifold).rotate(csgTree.degrees);
        case 'scale':
            return getManifold(manifold, csgTree.manifold).scale(csgTree.factor);
        case 'transform':
            return getManifold(manifold, csgTree.manifold).transform(csgTree.matrix);
        case 'refine':
            return getManifold(manifold, csgTree.manifold).refine(csgTree.splits);
        case 'asOriginal':
            return getManifold(manifold, csgTree.manifold).asOriginal();
        case 'extrude':
            return (manifold as ManifoldStatic).extrude(
                csgTree.crossSection, csgTree.height, csgTree.nDivisions,
                csgTree.twistDegrees, csgTree.scaleTop
            );
        case 'revolve':
            return (manifold as ManifoldStatic).revolve(
                csgTree.crossSection, csgTree.circularSegments
            );
        case 'compose':
        case 'decompose':
            throw new Error(`${csgTree.operation} operation is not implemented yet`);
        default:
            throw new Error(`Unknown operation: ${csgTree.operation}`);
        }
    }
}

function doOperationTop(manifold: unknown, operation: CSGOperation<Mesh>): Mesh | boolean | number | Box | Properties | Curvature {
    let output: Manifold;
    if ('primitive' in operation) {
        output = doOperation(manifold, operation);
    } else {
        switch (operation.operation) {
        case 'isEmpty':
            return getManifold(manifold, operation.manifold).isEmpty();
        case 'numVert':
            return getManifold(manifold, operation.manifold).numVert();
        case 'numTri':
            return getManifold(manifold, operation.manifold).numTri();
        case 'numEdge':
            return getManifold(manifold, operation.manifold).numEdge();
        case 'boundingBox':
            return getManifold(manifold, operation.manifold).boundingBox();
        case 'precision':
            return getManifold(manifold, operation.manifold).precision();
        case 'genus':
            return getManifold(manifold, operation.manifold).genus();
        case 'getProperties':
            return getManifold(manifold, operation.manifold).getProperties();
        case 'getCurvature':
            return getManifold(manifold, operation.manifold).getCurvature();
        case 'originalID':
            return getManifold(manifold, operation.manifold).originalID();
        default:
            output = doOperation(manifold, operation);
        }
    }

    return output.getMesh();
}

function logWorker(callback: (message: string) => void, message: unknown) {
    callback(`[Worker ${self.name}] ${message}`);
}

// TODO types
let manifoldModule: unknown | null = null;
globalThis.onmessage = async function(message: MessageEvent<WorkerRequest>) {
    switch(message.data.type) {
        case 'initialize':
            if (!manifoldModule) {
                try {
                    importScripts(message.data.libraryPath);
                    const mod = await Module();
                    manifoldModule = mod;
                    mod.setup();
                } catch(error) {
                    // TODO clean up module properly
                    manifoldModule = null;
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
        case 'operation':
        {
            if (!manifoldModule) {
                postMessage(<WorkerResponse>{
                    type: 'crash',
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
                    mesh: doOperationTop(manifoldModule, message.data.operation),
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
            }

            logWorker(console.debug, `Job ${message.data.jobID} finished`);
            return;
        }
        default:
        {
            const error = `Unknown worker request type: ${message.data.type}`;
            logWorker(console.error, error);
            postMessage(<WorkerResponse>{ type: 'crash', error });
        }
    }
}

logWorker(console.debug, 'Created');
postMessage(<WorkerResponse>{ type: 'created' });