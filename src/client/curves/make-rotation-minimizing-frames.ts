import { quat, vec3 } from 'gl-matrix';

const HALF_PI = Math.PI / 2;
const TAU = Math.PI * 2;
const tq0 = quat.create();
const tv0 = vec3.create();
const tv1 = vec3.create();
const tv2 = vec3.create();

import type { CurveFrames } from './curve-frame';

/**
 * Optional arguments for rotation minimizing curve generation.
 */
export interface RMFOptions {
    /**
     * End boundary condition for the RMF curve; the up direction at the end of
     * the curve.
     */
    endNormal?: vec3;
    /** How many twists should be added to the curve. 0 by default. */
    twists?: number;
}

/**
 * Generate a list of rotation-minimizing CurveFrames from a given list of
 * curve points, curve tangents and a starting normal.
 *
 * @param positions - The list of points in the curve.
 * @param tangents - The list of tangents (directions) in the curve, as normalized vectors.
 * @param startNormal - The starting normal (up direction) of the curve.
 * @param options - Optional arguments object.
 * @returns A list of rotation-minimizing curve frames.
 */
export function makeRotationMinimizingFrames(positions: Array<vec3>, tangents: Array<vec3>, startNormal: vec3, options?: RMFOptions): CurveFrames {
    // XXX startNormal should be a unit vector pointing up, or if the start is
    // rotated, then the rotated up unit vector

    // validate curve
    const pointCount = positions.length;

    if (tangents.length < pointCount) {
        throw new Error('There must be at least one tangent per point');
    }

    if (pointCount < 2) {
        throw new Error('There must be at least 1 segment (2 points) in the curve');
    }

    // compute rotation minimizing frames. using method from this paper:
    // https://www.microsoft.com/en-us/research/publication/computation-rotation-minimizing-frames/
    const frames: CurveFrames = new Array(pointCount);
    const startTangent = tangents[0];
    const startBinormal = vec3.cross(vec3.create(), startTangent, startNormal);
    // first frame = (r,s,t); r = normal, s = binormal, t = tangent
    frames[0] = [startNormal, startBinormal, startTangent];

    for (let i = 0; i < pointCount - 1; i++) {
        const v_1 = vec3.sub(tv0, positions[i + 1], positions[i]);
        const c_1 = vec3.dot(v_1, v_1);
        const r_i = frames[i][0];
        const t_i = frames[i][2];
        const temp = -2 / c_1;
        const r_L_i = vec3.scaleAndAdd(tv1, r_i, v_1, vec3.dot(v_1, r_i) * temp);
        const t_L_i = vec3.scaleAndAdd(tv2, t_i, v_1, vec3.dot(v_1, t_i) * temp);

        const t_i1 = tangents[i + 1];

        const v_2 = vec3.sub(tv2, t_i1, t_L_i);
        const c_2 = vec3.dot(v_2, v_2);
        const r_i1 = vec3.scaleAndAdd(vec3.create(), r_L_i, v_2, vec3.dot(v_2, r_L_i) * -2 / c_2);
        const s_i1 = vec3.cross(vec3.create(), t_i1, r_i1);

        frames[i + 1] = [r_i1, s_i1, t_i1];
    }

    const endNormal = options?.endNormal;
    const twists = options?.twists ?? 0;
    if (endNormal || twists > 0) {
        let angleErr = 0;

        if (endNormal) {
            // end normal included. calculate the error between the computed
            // normal in the last frame and the wanted normal. convert it to an
            // angle.

            // this is an extension to the algorithm described in the same paper
            // as before (section 6.3: variational principles for rmf with
            // boundary conditions)

            const endTangent = tangents[pointCount - 1];
            const endBinormal = vec3.cross(vec3.create(), endTangent, endNormal);
            const actualNormal = frames[pointCount - 1][0];

            const dx = vec3.dot(endBinormal, actualNormal);
            const dy = vec3.dot(endNormal, actualNormal);

            if (dx !== 0 && dy !== 0) {
                angleErr = Math.atan2(dy, dx) - HALF_PI;
            }
        }

        angleErr += TAU * twists;

        if (angleErr !== 0) {
            // divide the angle evenly along the curve (angular speed). apply
            // the angular speed to the whole curve
            // XXX the technique's article uses a curvature value that is
            // calculated from the second differential of the curve, however, we
            // are estimating it by getting the length of each segment instead.
            // the more segments there are, the more accurate the curvature
            // value is
            let totalLength = 0;
            let lastPos = positions[0];
            for (let i = 1; i < pointCount; i++) {
                const curPos = positions[i];
                totalLength += vec3.distance(lastPos, curPos);
                lastPos = curPos;
            }

            let interpLength = 0;
            lastPos = positions[0];
            for (let i = 1; i < pointCount; i++) {
                const [r, s, _t] = frames[i];
                const curPos = positions[i];
                interpLength += vec3.distance(lastPos, curPos);
                lastPos = curPos;

                const thisAngleErr = angleErr * interpLength / totalLength;
                quat.setAxisAngle(tq0, tangents[i], thisAngleErr);
                vec3.transformQuat(r, r, tq0);
                vec3.transformQuat(s, s, tq0);
            }
        }
    }

    return frames;
}