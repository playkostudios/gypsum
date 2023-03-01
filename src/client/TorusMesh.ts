import { vec2 } from 'gl-matrix';
import { makeCirclePolyline } from '../client';
import { SolidOfRevolutionMesh, SolidOfRevolutionNoOffsetOptions } from './SolidOfRevolutionMesh';

import type * as WL from '@wonderlandengine/api';

/** Optional arguments for torus generation. */
export interface TorusOptions extends SolidOfRevolutionNoOffsetOptions {
    /** The amound of radial segments in a slice. */
    radialSegments?: number;
}

/**
 * A procedural torus.
 *
 * @category Procedural Mesh
 */
export class TorusMesh extends SolidOfRevolutionMesh {
    /**
     * Make a new torus at (0, 0, 0), which revolves around the Y axis.
     *
     * @param engine - The Wonderland Engine instance to use this mesh for
     * @param innerRadius - The inner radius of the torus.
     * @param outerRadius - The outer radius of the torus. The thickness of the slice is the outer radius minus the inner radius, therefore, this must be bigger than the inner radius.
     * @param options - Optional arguments for torus generation.
     */
    constructor(engine: WL.WonderlandEngine, innerRadius: number, outerRadius: number, options?: TorusOptions) {
        if (innerRadius >= outerRadius || innerRadius < 0 || outerRadius < 0) {
            throw new Error('Invalid radii; inner radius must be lesser than outer radius and radii must be zero or positive');
        }

        const sliceRadius = (outerRadius - innerRadius) / 2;
        const offset = vec2.fromValues(innerRadius + sliceRadius, 0);

        super(
            engine,
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