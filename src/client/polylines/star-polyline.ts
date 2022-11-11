import { vec2 } from 'gl-matrix';

const TAU = Math.PI * 2;

export function makeStarPolyline(outerRadius: number, innerRadius: number, sides: number, clockwise = false): Array<vec2> {
    if (sides < 3) {
        throw new Error('There must be at least 3 sides in a star polyline');
    }

    const polyline = new Array(sides * 2);
    const sidesM1 = sides - 1;
    const halfAngle = TAU / sides / 2;
    let k = 0;

    for (let i = 0; i < sides; i++) {
        const j = clockwise ? i : (sidesM1 - i);

        const outerAngle = TAU * j / sides;
        const outerY = Math.cos(outerAngle) * outerRadius;
        const outerX = Math.sin(outerAngle) * outerRadius;
        const outerPos = vec2.fromValues(outerX, outerY);

        const innerAngle = outerAngle + halfAngle;
        const innerY = Math.cos(innerAngle) * innerRadius;
        const innerX = Math.sin(innerAngle) * innerRadius;
        const innerPos = vec2.fromValues(innerX, innerY);

        if (clockwise) {
            polyline[k++] = outerPos;
            polyline[k++] = innerPos;
        } else {
            polyline[k++] = innerPos;
            polyline[k++] = outerPos;
        }
    }

    return polyline;
}