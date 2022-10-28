import { CSGFinalOperation } from './CSGFinalOperation';
import { CSGTree } from './CSGTree';

export type CSGOperation<MeshType> = CSGFinalOperation<MeshType> | CSGTree<MeshType>;