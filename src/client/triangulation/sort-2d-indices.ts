import type { vec2 } from 'gl-matrix';

export default function sort2DIndices(polyline: Array<vec2>): Array<number> {
    const indices = Array.from({ length: polyline.length }, (_, i) => i);
    indices.sort((aIdx, bIdx) => {
        // if a < b, then -1, if a = b, then 0, if a > b, then 1
        const a: vec2 = polyline[aIdx];
        const b: vec2 = polyline[bIdx];

        // compare x
        if (a[0] < b[0]) {
            return -1;
        } else if (a[0] > b[0]) {
            return 1;
        } else {
            // x equal. compare y
            if (a[1] < b[1]) {
                return -1;
            } else if (a[1] > b[1]) {
                return 1;
            } else {
                return 0;
            }
        }
    });

    return indices;
}