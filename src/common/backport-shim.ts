// TODO remove once 1.0.0 comes out
import type { Mesh, MeshParameters } from '@wonderlandengine/api';

export interface WonderlandEngine {
    Mesh: typeof Mesh
}

export function newShim_Mesh(engine: WonderlandEngine, params: Partial<MeshParameters>) {
    console.debug(params);
    return new engine.Mesh(params);
}
