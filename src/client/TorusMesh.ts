import { vec2 } from 'gl-matrix';
import { makeCirclePolyline } from '../client';
import { SolidOfRevolutionMesh, SolidOfRevolutionNoOffsetOptions } from './SolidOfRevolutionMesh';

export interface TorusOptions extends SolidOfRevolutionNoOffsetOptions {
    radialSegments?: number;
}

export class TorusMesh extends SolidOfRevolutionMesh {
    constructor(innerRadius: number, outerRadius: number, options?: TorusOptions) {
        if (innerRadius >= outerRadius || innerRadius < 0 || outerRadius < 0) {
            throw new Error('Invalid radii; inner radius must be lesser than outer radius and radii must be zero or positive');
        }

        const sliceRadius = (outerRadius - innerRadius) / 2;
        const offset = vec2.fromValues(innerRadius + sliceRadius, 0);

        super(
            makeCirclePolyline(sliceRadius, false, options?.radialSegments ?? 12),
            {
                smoothNormals: true,
                ...options,
                offset,
                maxSmoothAngle: Math.PI,
            },
        );
    }
}