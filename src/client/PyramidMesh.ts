import { BasePrismoidPyramidMesh } from './BasePrismoidPyramidMesh';
import { vec3 } from 'gl-matrix';

import type { vec2 } from 'gl-matrix';
import type { PrismPyramidOptions } from './PrismPyramidOptions';

/**
 * A procedural pyramid.
 *
 * @category Procedural Mesh
 */
export class PyramidMesh extends BasePrismoidPyramidMesh {
    /**
     * Make a new pyramid.
     *
     * @param polyline - Polyline used for the pyramid's base.
     * @param options - Optional arguments for the pyramid generation.
     */
    constructor(polyline: Array<vec2>, options?: PrismPyramidOptions) {
        super(
            polyline,
            options?.baseScale ?? 1,
            0,
            vec3.create(),
            vec3.fromValues(0, options?.height ?? 1, 0),
            // 0.9 radians (approx. PI / 3.5) is close to 45 degrees
            (options?.smoothNormals ?? false)
                ? (options?.maxSmoothAngle ?? 0.9)
                : null,
            options?.baseMaterial ?? null,
            options?.sideMaterial ?? null,
        );
    }
}