import { makeRegularPolyline } from './regular-polyline';

import type { vec2 } from 'gl-matrix';

export function makeCirclePolyline(radius: number, clockwise = false, subDivisions = 12): Array<vec2> {
    return makeRegularPolyline(radius, subDivisions, clockwise);
}