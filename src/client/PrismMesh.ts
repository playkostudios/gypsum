import { BasePrismoidPyramidMesh } from './BasePrismoidPyramidMesh';
import { vec3 } from 'gl-matrix';

import type { vec2 } from 'gl-matrix';
import type { PrismPyramidOptions } from './PrismPyramidOptions';

export class PrismMesh extends BasePrismoidPyramidMesh {
    constructor(polyline: Array<vec2>, options?: PrismPyramidOptions) {
        const baseScale = options?.baseScale ?? 1;

        super(
            polyline,
            baseScale,
            baseScale,
            vec3.create(),
            vec3.fromValues(0, options?.height ?? 1, 0),
            options?.smoothNormals ?? false
        );
    }
}