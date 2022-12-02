import type { vec3 } from 'gl-matrix';

/**
 * A frame (point directions) of a curve.
 * r: normal -> up direction of the curve
 * s: binormal -> right direction of the curve
 * t: tangent -> forward direction of the curve
 */
export type CurveFrame = [r: vec3, s: vec3, t: vec3];

/**
 * A list of curve frames ({@link CurveFrame})
 */
export type CurveFrames = Array<CurveFrame>;