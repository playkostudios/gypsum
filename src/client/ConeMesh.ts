import { PyramidMesh } from './PyramidMesh';
import { makeCirclePolyline } from '../client';

import type { PrismPyramidOptions } from './PrismPyramidOptions';
import type * as WL from '@wonderlandengine/api';

/** Optional arguments for cone generation. */
export interface ConeOptions extends PrismPyramidOptions {
    /**
     * The amount of sides in the cone, since the cone is actually an
     * approximation and implemented as a pyramid.
     */
    subDivisions?: number;
    /**
     * The radius of the base of the cone
     */
    radius?: number;
}

/**
 * A cone approximation, implemented as a pyramid with a circular base.
 *
 * @category Procedural Mesh
 */
export class ConeMesh extends PyramidMesh {
    /**
     * Make a new cone. By default, it occupies a 1x1x1 bounding volume (radius
     * 0.5, height 1).
     *
     * @param engine - The Wonderland Engine instance to use this mesh for
     * @param options - Optional arguments for cone generation.
     */
    constructor(engine: WL.WonderlandEngine, options?: ConeOptions) {
        super(
            engine,
            makeCirclePolyline(options?.radius ?? 0.5, false, options?.subDivisions ?? 12),
            {
                smoothNormals: true,
                maxSmoothAngle: Math.PI, // default to 180 maximum angle; we want the sides to be smooth no matter what
                ...options,
            }
        );
    }
}