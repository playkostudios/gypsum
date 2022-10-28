import type { CSGTree } from './CSGTree';

// XXX a final operation is an operation that DOES NOT return a manifold (and
// therefore CANNOT be chained)

export type CSGFinalOperation<MeshType> = {
    operation: 'isEmpty' | 'numVert' | 'numTri' | 'numEdge' | 'boundingBox' | 'precision' | 'genus' | 'getProperties' | 'getCurvature' | 'originalID',
    manifold: CSGTree<MeshType> | MeshType,
};