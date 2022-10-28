import type { CSGGeometricOperation } from './CSGGeometricOperation';
import type { CSGPrimitive } from './CSGPrimitive';

export type CSGTree<MeshType> = CSGGeometricOperation<MeshType> | CSGPrimitive;