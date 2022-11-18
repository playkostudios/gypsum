import { BasePrismoidPyramidMesh } from './BasePrismoidPyramidMesh';
import { vec3 } from 'gl-matrix';

import type { vec2 } from 'gl-matrix';
import type { PrismPyramidOptions } from './PrismPyramidOptions';

export class PyramidMesh extends BasePrismoidPyramidMesh {
    constructor(polyline: Array<vec2>, options?: PrismPyramidOptions) {
        super(
            polyline,
            options?.baseScale ?? 1,
            0,
            vec3.create(),
            vec3.fromValues(0, options?.height ?? 1, 0),
            options?.smoothNormals ?? false
        );
    }
}