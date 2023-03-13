import { makeRegularPolyline } from './regular-polyline';

import type { vec2 } from 'gl-matrix';

/**
 * Make a circle polyline; a line which creates a circle polygon.
 *
 * @param radius - The radius of the circle.
 * @param clockwise - Should the polyline be in clockwise order? False by default.
 * @param subDivisions - The amount of segments in the circle. 12 by default.
 */
export function makeCirclePolyline(radius: number, clockwise = false, subDivisions = 12): Array<vec2> {
    return makeRegularPolyline(radius, subDivisions, clockwise);
}