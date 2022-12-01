import { vec3 } from 'gl-matrix';
import { EPS } from '../misc/EPS';
import { CurveFrames } from './curve-frame';

/**
 * Extend the start and end of a list of curve frames and positions. Useful for
 * doing subtraction operations. Inputs are not modified in-place. If an empty
 * list is supplied, an error is thrown. All tangents must be normalized and
 * valid, make sure to call {@link fixTangentList} to the input lists. Frames
 * and positions lists must match in length.
 *
 * @param extension How many units of length the start and end will be extended out. Defaults to 1e-7
 */
export function extendCurveFrames(frames: CurveFrames, positions: Array<vec3>, extension = EPS): [frames: CurveFrames, positions: Array<vec3>] {
    // validate inputs
    const frameCount = frames.length;
    if (frameCount === 0) {
        throw new Error('Cannot extend curve frame list with zero length');
    }
    if (frameCount !== positions.length) {
        throw new Error("Frames and positions lists' lengths must match");
    }

    // extend start
    const [or0, os0, ot0] = frames[0];
    const op0 = positions[0];
    const r0 = vec3.clone(or0);
    const s0 = vec3.clone(os0);
    const t0 = vec3.clone(ot0);
    const p0 = vec3.scaleAndAdd(vec3.create(), op0, t0, -extension);

    // extend end
    const lastFrameIdx = frameCount - 1;
    const [orN, osN, otN] = frames[lastFrameIdx];
    const opN = positions[lastFrameIdx];
    const rN = vec3.clone(orN);
    const sN = vec3.clone(osN);
    const tN = vec3.clone(otN);
    const pN = vec3.scaleAndAdd(vec3.create(), opN, tN, extension);

    // make final arrays
    return [
        [ [r0, s0, t0], ...frames, [rN, sN, tN] ],
        [ p0, ...positions, pN ]
    ]
}