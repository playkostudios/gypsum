import { vec2, vec3 } from 'gl-matrix';
import { ExtrusionMesh } from './ExtrusionMesh';

import type { CurveFrames } from './rmf/curve-frame';

const TAU = Math.PI * 2;

export interface SolidOfRevolutionNoOffsetOptions {
    smoothNormals?: boolean;
    maxSmoothAngle?: number;
    segments?: number;
    segmentsUVs?: [startV: number | null, endV: number | null, segmentsUs: Array<number> | null];
}

export interface SolidOfRevolutionOptions extends SolidOfRevolutionNoOffsetOptions {
    offset?: vec2;
}

export class SolidOfRevolutionMesh extends ExtrusionMesh {
    constructor(polyline: Array<vec2>, options?: SolidOfRevolutionOptions) {
        const offset = options?.offset ?? vec2.create();
        const segments = options?.segments ?? 16;

        // make transformed polyline (just for validation, not used by the
        // extrusion)
        const polylineLen = polyline.length;
        const finalPolyline = new Array<vec2>(polylineLen);

        for (let i = 0; i < polylineLen; i++) {
            const newPos = vec2.add(vec2.create(), polyline[i], offset);

            if (newPos[0] < 0) {
                throw new Error('Self-intersecting solids of revolution are not yet supported');
            }

            finalPolyline[i] = newPos;
        }

        // handle solid middles
        // TODO - for now this just fails. in the future, this will mark parts
        // of the slice that touch the middle
        let hadCenterPos = false;
        for (const pos of finalPolyline) {
            const hasCenterPos = pos[0] === 0;
            if (hasCenterPos && hadCenterPos) {
                throw new Error('Solids of revolution with a solid middle are not yet supported');
            }

            hadCenterPos = hasCenterPos;
        }

        // make frames. curve rotates in the CCW direction (this decision is
        // completely arbitrary; it doesn't affect the winding order)
        const curvePositions = new Array(segments + 1);
        const frames: CurveFrames = new Array(segments + 1);
        const radialSegInv = TAU / segments;

        for (let i = 0; i < segments; i++) {
            const angle = i * radialSegInv;
            const sinAngle = Math.sin(angle);
            const cosAngle = Math.cos(angle);

            curvePositions[i] = vec3.fromValues(
                offset[0] * cosAngle,
                offset[1],
                offset[0] * -sinAngle,
            );

            frames[i] = [
                vec3.fromValues(0, 1, 0), // normal
                vec3.fromValues(cosAngle, 0, -sinAngle), // binormal
                vec3.fromValues(-sinAngle, 0, -cosAngle), // tangent
            ];
        }

        curvePositions[segments] = curvePositions[0];
        frames[segments] = frames[0];

        // do looped extrusion
        super(polyline, curvePositions, frames, { ...options });
    }
}