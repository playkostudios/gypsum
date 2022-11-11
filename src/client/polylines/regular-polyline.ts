import { vec2 } from 'gl-matrix';

const TAU = Math.PI * 2;

export function makeRegularPolyline(radius: number, sides: number, clockwise = false): Array<vec2> {
    if (sides < 3) {
        throw new Error('There must be at least 3 sides in a regular polyline');
    }

    const polyline = new Array(sides);
    const sidesM1 = sides - 1;

    for (let i = 0; i < sides; i++) {
        const j = clockwise ? i : (sidesM1 - i);
        const angle = TAU * j / sides;
        const y = Math.cos(angle) * radius;
        const x = Math.sin(angle) * radius;
        polyline[i] = vec2.fromValues(x, y);
    }

    return polyline;
}