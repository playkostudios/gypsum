import { BasePrismoidPyramidMesh } from './BasePrismoidPyramidMesh';
import { vec3 } from 'gl-matrix';

import type { vec2 } from 'gl-matrix';
import type { SmoothNormalsOptions } from './SmoothNormalsOptions';
import type { WonderlandEngine, Material } from '@wonderlandengine/api';

/**
 * Optional arguments for a procedural frustum.
 */
export interface FrustumOptions extends SmoothNormalsOptions {
    /** The uniform scale of the base. */
    baseScale?: number;
    /** The material used for the frustum bases. */
    baseMaterial?: Material;
    /** The material used for the sides of the frustum. */
    sideMaterial?: Material;
}

/**
 * A frustum implemented as a prism with a scaled top base.
 *
 * @category Procedural Mesh
 */
export class FrustumMesh extends BasePrismoidPyramidMesh {
    /**
     * Make a new frustum.
     *
     * @param engine - The Wonderland Engine instance to use this mesh for
     * @param polyline - The polyline for the base.
     * @param apex - The apex point of the frustum.
     * @param height - The height of the frustum. The height is expected to not exceed the apex.
     * @param options - Optional arguments for the frustum generation.
     */
    constructor(engine: WonderlandEngine, polyline: Array<vec2>, apex: vec3, height: number, options?: FrustumOptions) {
        const baseScale = options?.baseScale ?? 1;
        const apexHeight = Math.abs(apex[1]);
        const topScale = baseScale * height / apexHeight;
        const topOffset = vec3.clone(apex);
        vec3.scale(topOffset, topOffset, 1 - height / apexHeight);

        super(
            engine,
            polyline,
            baseScale,
            topScale,
            vec3.create(),
            topOffset,
            // 0.9 radians (approx. PI / 3.5) is close to 45 degrees
            (options?.smoothNormals ?? false)
                ? (options?.maxSmoothAngle ?? 0.9)
                : null,
            options?.baseMaterial ?? null,
            options?.sideMaterial ?? null,
        );
    }
}