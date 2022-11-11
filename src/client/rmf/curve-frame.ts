import type { vec3 } from 'gl-matrix';

/**
 * A frame (point directions) of a curve.
 * r: normal
 * s: binormal
 * t: tangent
 */
export type CurveFrame = [r: vec3, s: vec3, t: vec3];
export type CurveFrames = Array<CurveFrame>;