import type { vec2 } from 'gl-matrix';

/**
 * Check if a triangle has a clockwise winding order.
 *
 * @param a - The first vertex of the triangle.
 * @param b - The second vertex of the triangle.
 * @param c - The third vertex of the triangle.
 * @returns True if the triangle has a clockwise winding order, false if it is counter-clockwise.
 */
export default function isClockwise2DTriangle(a: vec2, b: vec2, c: vec2): boolean {
    // similar to isClockwise2DPolygon, but optimised for 3 points
    return (
        (b[0] - a[0]) * (b[1] + a[1]) +
        (c[0] - b[0]) * (c[1] + b[1]) +
        (a[0] - c[0]) * (a[1] + c[1])
    ) >= 0;
}