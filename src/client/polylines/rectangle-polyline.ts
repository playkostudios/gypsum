import { vec2 } from 'gl-matrix';

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