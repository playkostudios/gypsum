import { makeCirclePolyline } from '../client';
import { PrismMesh } from './PrismMesh';

import type { PrismPyramidOptions } from './PrismPyramidOptions';

export interface CylinderOptions extends PrismPyramidOptions {
    subDivisions?: number;
    radius?: number;
}

export class CylinderMesh extends PrismMesh {
    constructor(options?: CylinderOptions) {
        super(
            makeCirclePolyline(options?.radius ?? 0.5, false, options?.subDivisions ?? 12),
            options
        );
    }
}