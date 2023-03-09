import { BasePrismoidPyramidMesh } from './BasePrismoidPyramidMesh';
import { vec3 } from 'gl-matrix';

import type { vec2 } from 'gl-matrix';
import type { SmoothNormalsOptions } from './SmoothNormalsOptions';
import type { WonderlandEngine, Material } from '@wonderlandengine/api';

/** Optional arguments for the prismoid generation. */
export interface PrismoidOptions extends SmoothNormalsOptions {
    /** The offset for the bottom base. */
    bottomOffset?: vec3;
    /** The offset for the top base. */
    topOffset?: vec3;
    /** The scale for the bottom base. */
    bottomScale?: number;
    /** The scale for the top base. */
    topScale?: number;
    /** The material to use for the bases. */
    baseMaterial?: Material;
    /** The material to use for the sides. */
    sideMaterial?: Material;
}

/**
 * A procedural prismoid which extrudes along the Y direction, with optional
 * shear.
 *
 * @category Procedural Mesh
 */
export class PrismoidMesh extends BasePrismoidPyramidMesh {
    /**
     * Make a new prismoid.
     *
     * @param engine - The Wonderland Engine instance to use this mesh for
     * @param polyline - The polyline to use for the base.
     * @param options - Optional arguments for the prismoid generation.
     */
    constructor(engine: WonderlandEngine, polyline: Array<vec2>, options?: PrismoidOptions) {
        super(
            engine,
            polyline,
            options?.bottomScale ?? 1,
            options?.topScale ?? 1,
            options?.bottomOffset ?? vec3.create(),
            options?.topOffset ?? vec3.fromValues(0, 1, 0),
            // 0.9 radians (approx. PI / 3.5) is close to 45 degrees
            (options?.smoothNormals ?? false)
                ? (options?.maxSmoothAngle ?? 0.9)
                : null,
            options?.baseMaterial ?? null,
            options?.sideMaterial ?? null,
        );
    }
}