import { vec2 } from 'gl-matrix';

/**
 * Make a rectangular polyline; a line which creates a rectangle polygon.
 *
 * @param width - The width of the rectangle.
 * @param height - The height of the rectangle.
 * @param clockwise - Should the polyline be in clockwise order? False by default.
 */
export function makeRectanglePolyline(width: number, height: number, clockwise = false): Array<vec2> {
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    return clockwise ? [
        vec2.fromValues(halfWidth, halfHeight), vec2.fromValues(halfWidth, -halfHeight),
        vec2.fromValues(-halfWidth, -halfHeight), vec2.fromValues(-halfWidth, halfHeight)
    ] : [
        vec2.fromValues(halfWidth, halfHeight), vec2.fromValues(-halfWidth, halfHeight),
        vec2.fromValues(-halfWidth, -halfHeight), vec2.fromValues(halfWidth, -halfHeight)
    ];
}