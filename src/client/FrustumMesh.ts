import { BasePrismoidPyramidMesh } from './BasePrismoidPyramidMesh';
import { vec3 } from 'gl-matrix';

import type { vec2 } from 'gl-matrix';
import type { SmoothNormalsOptions } from './SmoothNormalsOptions';

export interface FrustumOptions extends SmoothNormalsOptions {
    baseScale?: number;
    baseMaterial?: WL.Material;
    sideMaterial?: WL.Material;
}

export class FrustumMesh extends BasePrismoidPyramidMesh {
    constructor(polyline: Array<vec2>, apex: vec3, height: number, options?: FrustumOptions) {
        const baseScale = options?.baseScale ?? 1;
        const apexHeight = Math.abs(apex[1]);
        const topScale = baseScale * height / apexHeight;
        const topOffset = vec3.clone(apex);
        vec3.scale(topOffset, topOffset, 1 - height / apexHeight);

        super(
            polyline,
            baseScale,
            topScale,
            vec3.create(),
            topOffset,
            // 0.9 radians (approx. PI / 3.5) is close to 45 degrees
            (options?.smoothNormals ?? false)
                ? (options?.maxSmoothAngle ?? 0.9)
                : null,
            options?.baseMaterial ?? null,
            options?.sideMaterial ?? null,
        );
    }
}