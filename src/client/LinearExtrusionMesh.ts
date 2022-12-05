// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../types/globals.d.ts" />

import { ExtrusionMesh } from './ExtrusionMesh';

import type { vec2, vec3 } from 'gl-matrix';
import type { CurveFrame } from './curves/curve-frame';
import type { ExtrusionOptions } from './ExtrusionMesh';

/**
 * A simple extrusion along the Z direction.
 *
 * @category Procedural Mesh
 */
export class LinearExtrusionMesh extends ExtrusionMesh {
    /**
     * Make an extrusion along the Z direction.
     *
     * @param polyline - The slice to use for the extrusion.
     * @param depth - The amount to extrude along the Z direction.
     * @param options - Optional arguments for the extrusion.
     */
    constructor(polyline: Array<vec2>, depth: number, options?: ExtrusionOptions) {
        const positions: Array<vec3> = [[0, 0, 0], [0, 0, depth]];
        const forwardFrame: CurveFrame = depth >= 0
            ? [[0, 1, 0], [-1, 0, 0], [0, 0, 1]]
            : [[0, 1, 0], [1, 0, 0], [0, 0, -1]];
        const frames = [forwardFrame, forwardFrame];

        super(polyline, positions, frames, options);
    }
}