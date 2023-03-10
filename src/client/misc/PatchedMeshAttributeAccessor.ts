import type { MeshAttributeAccessor, NumberArray } from '@wonderlandengine/api';

// TODO delete this once the WLE API is fixed
export interface PatchedMeshAttributeAccessor<T extends Float32Array | Uint16Array> extends MeshAttributeAccessor {
    get(index: number, out?: NumberArray): T;
}