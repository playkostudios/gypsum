import { BasePrismoidPyramidMesh } from './BasePrismoidPyramidMesh';
import { vec3 } from 'gl-matrix';

import type { vec2 } from 'gl-matrix';
import type { SmoothNormalsOptions } from './SmoothNormalsOptions';

interface PrismoidOptions extends SmoothNormalsOptions {
    bottomOffset?: vec3;
    topOffset?: vec3;
    bottomScale?: number;
    topScale?: number;
}

export class PrismoidMesh extends BasePrismoidPyramidMesh {
    constructor(polyline: Array<vec2>, options?: PrismoidOptions) {
        super(polyline, options?.bottomScale ?? 1, options?.topScale ?? 1, options?.bottomOffset ?? vec3.create(), options?.topOffset ?? vec3.fromValues(0, 1, 0), options?.smoothNormals ?? false);
    }
}