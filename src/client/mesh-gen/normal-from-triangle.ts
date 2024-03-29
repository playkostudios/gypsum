import { vec3 } from 'gl-matrix';

const temp0 = vec3.create();
const temp1 = vec3.create();

/**
 * Calculate the face normal of a triangle, given the position of its corners,
 * in counter-clockwise order.
 *
 * @param a - The first corner's position.
 * @param b - The second corner's position.
 * @param c - The third corner's position.
 * @param out - The vector to store the output in. If not provided, then a temporary SHARED vec3 is used, which is not safe to store.
 */
export function normalFromTriangle(a: Readonly<vec3>, b: Readonly<vec3>, c: Readonly<vec3>, out: vec3 = temp0) {
    vec3.sub(temp0, b, a); // BA
    vec3.sub(temp1, b, c); // BC
    vec3.cross(out, temp1, temp0); // normal
    vec3.normalize(out, out); // make sure normal is a unit vector
    return out;
}