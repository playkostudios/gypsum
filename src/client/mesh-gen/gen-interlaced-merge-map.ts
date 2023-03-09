import { BitArray } from './BitArray';

import type { DynamicArray } from '../../common/DynamicArray';
import type { Triangle } from './Triangle';

export function genInterlacedMergeMap(triangles: Array<Triangle>, triIdxMap: Uint32Array | null, interlacedMergeMap: DynamicArray<Uint32ArrayConstructor>) {
    const visitedVertices = new BitArray(triangles.length * 3, false);
    const orderedTriangles = triIdxMap === null;

    for (const triangle of triangles) {
        // iterate all 3 vertices of triangle
        const indexOffset = orderedTriangles ? triangle.helper : triIdxMap[triangle.helper];

        for (let v = 0; v < 3; v++) {
            // abort if visited already
            const vIdx = indexOffset + v;
            if (visitedVertices.getAndSet(vIdx, true)) {
                continue;
            }

            // visit vertex star
            const star = triangle.getVertexStar(v);
            for (const [oTriangle, ov] of star) {
                if (oTriangle === triangle && v === ov) {
                    continue;
                }

                // abort if other vertex is already visited
                const oIndexOffset = orderedTriangles ? oTriangle.helper : triIdxMap[oTriangle.helper];
                const ovIdx = oIndexOffset + ov;
                if (visitedVertices.getAndSet(ovIdx, true)) {
                    continue;
                }

                // add to merge map
                interlacedMergeMap.expandCapacity_guarded(interlacedMergeMap.length + 2);
                interlacedMergeMap.pushBack_guarded(ovIdx);
                interlacedMergeMap.pushBack_guarded(vIdx);
            }
        }
    }
}