// TODO remove once 1.0.0 comes out
import type { Mesh, MeshParameters } from '@wonderlandengine/api';

/**
 * An instance of the WL global variable. Used for forward-compatibility; will
 * be removed in Wonderland Engine 1.0.0.
 */
export interface WonderlandEngine {
    Mesh: typeof Mesh
}

export function newShim_Mesh(engine: WonderlandEngine, params: Partial<MeshParameters>) {
    return new engine.Mesh(params);
}
