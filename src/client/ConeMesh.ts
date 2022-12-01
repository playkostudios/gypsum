import { PyramidMesh } from './PyramidMesh';
import { makeCirclePolyline } from '../client';

import type { PrismPyramidOptions } from './PrismPyramidOptions';

export interface ConeOptions extends PrismPyramidOptions {
    subDivisions?: number;
    radius?: number;
}

export class ConeMesh extends PyramidMesh {
    constructor(options?: ConeOptions) {
        super(
            makeCirclePolyline(options?.radius ?? 0.5, false, options?.subDivisions ?? 12),
            {
                smoothNormals: true,
                maxSmoothAngle: Math.PI, // default to 180 maximum angle; we want the sides to be smooth no matter what
                ...options,
            }
        );
    }
}