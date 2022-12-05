import type { CSGTree } from './CSGTree';

/**
 * A CSG operation in a CSG operation tree that DOES NOT return a manifold, and
 * therefore cannot be chained.
 */
export type CSGFinalOperation<MeshType> = {
    operation: 'isEmpty' | 'numVert' | 'numTri' | 'numEdge' | 'boundingBox' | 'precision' | 'genus' | 'getProperties' | 'getCurvature' | 'originalID',
    manifold: CSGTree<MeshType> | MeshType,
};