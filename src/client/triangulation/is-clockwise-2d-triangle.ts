import type { vec2 } from 'gl-matrix';

export default function isClockwise2DTriangle(a: vec2, b: vec2, c: vec2): boolean {
    // similar to isClockwise2DPolygon, but optimised for 3 points
    return (
        (b[0] - a[0]) * (b[1] + a[1]) +
        (c[0] - b[0]) * (c[1] + b[1]) +
        (a[0] - c[0]) * (a[1] + c[1])
    ) >= 0;
}