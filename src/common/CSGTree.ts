import type { CSGGeometricOperation } from './CSGGeometricOperation';
import type { CSGPrimitive } from './CSGPrimitive';

/** A CSG operation tree, to be dispatched to a {@link CSGPool}. */
export type CSGTree<MeshType> = CSGGeometricOperation<MeshType> | CSGPrimitive;