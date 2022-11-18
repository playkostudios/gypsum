import { BasePrismoidPyramidMesh } from './BasePrismoidPyramidMesh';

import { vec2, vec3 } from 'gl-matrix';

export class PrismoidMesh extends BasePrismoidPyramidMesh {
    constructor(polyline: Array<vec2>, bottomScale: number, topScale: number, bottomOffset: vec3, topOffset: vec3) {
        // TODO
        super(polyline, bottomScale, topScale, bottomOffset, topOffset);
    }
}