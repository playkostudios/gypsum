import { makeCirclePolyline } from '../client';
import { PrismMesh } from './PrismMesh';

import type { PrismPyramidOptions } from './PrismPyramidOptions';
import type { RadialOptions } from './RadialOptions';

export interface CylinderOptions extends RadialOptions, PrismPyramidOptions {}

export class CylinderMesh extends PrismMesh {
    constructor(options?: CylinderOptions) {
        super(
            makeCirclePolyline(options?.radius ?? 0.5, false, options?.subDivisions ?? 12),
            options
        );
    }
}