import { CSGFinalOperation } from './CSGFinalOperation';
import { CSGTree } from './CSGTree';

/** A CSG operation in a CSG operation tree. */
export type CSGOperation<MeshType> = CSGFinalOperation<MeshType> | CSGTree<MeshType>;