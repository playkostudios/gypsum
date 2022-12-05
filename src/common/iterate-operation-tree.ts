import type { CSGFinalOperation } from './CSGFinalOperation';
import { CSGGeometricOperation } from './CSGGeometricOperation';
import type { CSGOperation } from './CSGOperation';
import type { CSGPrimitive } from './CSGPrimitive';
import type { CSGTree } from './CSGTree';

/** An internal context object used for iterating CSG operation trees. */
export type OpTreeCtx<MeshType> = { [key: string | number]: (CSGTree<MeshType> | MeshType) };

function iterateOpTreeNode<MeshType>(context: OpTreeCtx<MeshType>, key: string | number, node: CSGTree<MeshType> | MeshType, handleMesh: ((context: OpTreeCtx<MeshType>, key: string | number, mesh: MeshType) => void) | null = null, handlePrimitive: ((context: OpTreeCtx<MeshType>, key: string | number, operation: CSGPrimitive) => void) | null = null, handleOperation: ((context: OpTreeCtx<MeshType>, key: string | number, operation: CSGGeometricOperation<MeshType>) => void) | null = null): void {
    if ('primitive' in node) {
        // primitive
        switch (node.primitive) {
            case 'cube':
            case 'cylinder':
            case 'sphere':
            case 'tetrahedron':
                if (handlePrimitive) {
                    handlePrimitive(context, key, node);
                }
                break;
            default: {
                // XXX we're kinda fighting the type system here, but oh well
                const prim = (node as {primitive: string}).primitive;
                throw new Error(`Unknown primitive: ${prim}`);
            }
        }
    } else if ('operation' in node) {
        // operation
        switch (node.operation) {
            case 'add':
            case 'union':
            case 'subtract':
            case 'difference':
            case 'intersect':
            case 'intersection': {
                // XXX children are iterated from right to left so that they can
                // be pushed to a stack and then popped at the right order
                if ('manifolds' in node) {
                    for (let i = node.manifolds.length - 1; i >= 0; i--) {
                        iterateOpTreeNode(node.manifolds as unknown as OpTreeCtx<MeshType>, i, node.manifolds[i], handleMesh, handlePrimitive, handleOperation);
                    }
                } else {
                    iterateOpTreeNode(node as unknown as OpTreeCtx<MeshType>, 'right', node.right, handleMesh, handlePrimitive, handleOperation);
                    iterateOpTreeNode(node as unknown as OpTreeCtx<MeshType>, 'left', node.left, handleMesh, handlePrimitive, handleOperation);
                }

                if (handleOperation) {
                    handleOperation(context, key, node);
                }
                break;
            }
            case 'translate':
            case 'rotate':
            case 'scale':
            case 'transform':
            case 'refine':
            case 'asOriginal':
                iterateOpTreeNode(node as unknown as OpTreeCtx<MeshType>, 'manifold', node.manifold, handleMesh, handlePrimitive, handleOperation);
                // XXX intentional fallthrough
            case 'extrude':
            case 'revolve':
                if (handleOperation) {
                    handleOperation(context, key, node);
                }
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
    } else {
        // assume this is a mesh object
        if (handleMesh) {
            handleMesh(context, key, node);
        }
    }
}

/** An internal function for iterating CSG operation trees. */
export function iterateOpTree<MeshType>(tree: CSGOperation<MeshType>, handleMesh: ((context: OpTreeCtx<MeshType>, key: string | number, mesh: MeshType) => void) | null = null, handlePrimitive: ((context: OpTreeCtx<MeshType>, key: string | number, operation: CSGPrimitive) => void) | null = null, handleOperation: ((context: OpTreeCtx<MeshType>, key: string | number, operation: CSGGeometricOperation<MeshType>) => void) | null = null, handleTopOperation: ((context: OpTreeCtx<MeshType>, key: string | number, topOperation: CSGFinalOperation<MeshType>) => void) | null = null): void {
    const context = <OpTreeCtx<MeshType>>{
        root: tree
    };

    if ('primitive' in tree) {
        if (handlePrimitive) {
            handlePrimitive(context, 'root', tree);
        }
    } else {
        switch (tree.operation) {
            case 'isEmpty':
            case 'numVert':
            case 'numTri':
            case 'numEdge':
            case 'boundingBox':
            case 'precision':
            case 'genus':
            case 'getProperties':
            case 'getCurvature':
            case 'originalID':
                iterateOpTreeNode(tree as unknown as OpTreeCtx<MeshType>, 'manifold', tree.manifold, handleMesh, handlePrimitive, handleOperation);

                if (handleTopOperation) {
                    handleTopOperation(context, 'root', tree);
                }
                break;
            default:
                iterateOpTreeNode(context, 'root', tree, handleMesh, handlePrimitive, handleOperation);
        }
    }
}