import { ExtrusionMesh } from './ExtrusionMesh';

import type { vec2, vec3 } from 'gl-matrix';
import type { CurveFrame } from './curves/curve-frame';
import type { ExtrusionOptions } from './ExtrusionMesh';
import type * as WL from '@wonderlandengine/api';

/**
 * A simple extrusion along the Z direction.
 *
 * @category Procedural Mesh
 */
export class LinearExtrusionMesh extends ExtrusionMesh {
    /**
     * Make an extrusion along the Z direction.
     *
     * @param engine - The Wonderland Engine instance to use this mesh for
     * @param polyline - The slice to use for the extrusion.
     * @param depth - The amount to extrude along the Z direction.
     * @param options - Optional arguments for the extrusion.
     */
    constructor(engine: WL.WonderlandEngine, polyline: Array<vec2>, depth: number, options?: ExtrusionOptions) {
        const positions: Array<vec3> = [[0, 0, 0], [0, 0, depth]];
        const forwardFrame: CurveFrame = depth >= 0
            ? [[0, 1, 0], [-1, 0, 0], [0, 0, 1]]
            : [[0, 1, 0], [1, 0, 0], [0, 0, -1]];
        const frames = [forwardFrame, forwardFrame];

        super(engine, polyline, positions, frames, options);
    }
}