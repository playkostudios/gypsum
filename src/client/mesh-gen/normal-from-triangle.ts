import { vec3 } from 'gl-matrix';

const temp0 = vec3.create();
const temp1 = vec3.create();

export function normalFromTriangle(a: Readonly<vec3>, b: Readonly<vec3>, c: Readonly<vec3>, out: vec3 = temp0) {
    vec3.sub(temp0, b, a); // BA
    vec3.sub(temp1, b, c); // BC
    vec3.cross(out, temp1, temp0); // normal
    vec3.normalize(out, out); // make sure normal is a unit vector
    return out;
}