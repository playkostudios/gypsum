import { makeCirclePolyline } from '../client';
import { PrismMesh } from './PrismMesh';

import type { PrismPyramidOptions } from './PrismPyramidOptions';
import type { RadialOptions } from './RadialOptions';

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
     */
    constructor(options?: CylinderOptions) {
        super(
            makeCirclePolyline(options?.radius ?? 0.5, false, options?.subDivisions ?? 12),
            options
        );
    }
}