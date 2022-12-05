import type { vec2 } from 'gl-matrix';

/**
 * Check if a polyline has a clockwise winding order.
 *
 * @param polyline - The polyline to check; a list of 2D vertices, in order.
 * @returns True if the polyline has a clockwise winding order, false if it is counter-clockwise.
 */
export default function isClockwise2DPolygon(polyline: Array<vec2>): boolean {
    // sum up all the edges of the polygon to get 2x signed area. if signed area
    // is positive, then the polygon is clockwise
    let sum = 0;
    const vertCount = polyline.length;
    let last = polyline[vertCount - 1];

    for (const next of polyline) {
        sum += (next[0] - last[0]) * (next[1] + last[1]);
        last = next;
    }

    return sum >= 0;
}