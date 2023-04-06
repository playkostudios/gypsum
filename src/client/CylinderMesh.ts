import { makeCirclePolyline } from '../client';
import { PrismMesh } from './PrismMesh';

import type { PrismPyramidOptions } from './PrismPyramidOptions';
import type { RadialOptions } from './RadialOptions';
import type { WonderlandEngine } from '@wonderlandengine/api';

export interface CylinderOptions extends RadialOptions, PrismPyramidOptions {}

/**
 * A cylinder approximation, implemented as a prism with circular bases.
 *
 * @category Procedural Mesh
 */
export class CylinderMesh extends PrismMesh {
    /**
     * Make a new cylinder. By default, it occupies a 1x1x1 bounding volume
     * (radius 0.5, height 1).
     *
     * @param engine - The Wonderland Engine instance to use this mesh for
     */
    constructor(engine: WonderlandEngine, options?: CylinderOptions) {
        super(
            engine,
            makeCirclePolyline(options?.radius ?? 0.5, false, options?.subDivisions ?? 12),
            options
        );
    }
}