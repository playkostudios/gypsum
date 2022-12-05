import { vec2 } from 'gl-matrix';

/**
 * Make a square polyline; a line which creates a square polygon.
 *
 * @param length - The length of the square.
 * @param clockwise - Should the polyline be in clockwise order? False by default.
 */
export function makeSquarePolyline(length: number, clockwise = false): Array<vec2> {
    const half = length / 2;
    return clockwise ? [
        vec2.fromValues(half, half), vec2.fromValues(half, -half),
        vec2.fromValues(-half, -half), vec2.fromValues(-half, half)
    ] : [
        vec2.fromValues(half, half), vec2.fromValues(-half, half),
        vec2.fromValues(-half, -half), vec2.fromValues(half, -half)
    ];
}