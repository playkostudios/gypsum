import { BasePrismoidPyramidMesh } from './BasePrismoidPyramidMesh';
import { vec3 } from 'gl-matrix';

import type { vec2 } from 'gl-matrix';
import type { PrismPyramidOptions } from './PrismPyramidOptions';
import type { WonderlandEngine } from '@wonderlandengine/api';

/**
 * A procedural prism which extrudes along the Y direction.
 *
 * @category Procedural Mesh
 */
export class PrismMesh extends BasePrismoidPyramidMesh {
    /**
     * Make a new prism which extrudes along the Y direction.
     *
     * @param engine - The Wonderland Engine instance to use this mesh for
     * @param polyline - The polyline to use for the base.
     * @param options - Optional arguments for the prism generation.
     */
    constructor(engine: WonderlandEngine, polyline: Array<vec2>, options?: PrismPyramidOptions) {
        const baseScale = options?.baseScale ?? 1;

        super(
            engine,
            polyline,
            baseScale,
            baseScale,
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