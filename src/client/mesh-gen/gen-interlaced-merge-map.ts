import { BitArray } from './BitArray';

import type { DynamicArray } from '../../common/DynamicArray';
import type { Triangle } from './Triangle';

export type IndexRangeList = Array<[vertexStart: number, indexStart: number, indexEnd: number, indexData: Uint8Array | Uint16Array | Uint32Array | null]>;

export function getResolvedIndex(index: number, indices: IndexRangeList): number {
    for (const [vertexStart, indexStart, indexEnd, indexData] of indices) {
        if (index < indexStart || index >= indexEnd) {
            continue;
        }

        if (indexData === null) {
            return index - indexStart + vertexStart;
        } else {
            return indexData[index - indexStart] + vertexStart;
        }
    }

    throw new Error("Can't resolve index; index not in range");
}

export function genInterlacedMergeMap(triangles: Array<Triangle>, vertexCount: number, indices: IndexRangeList, triIdxMap: Uint32Array | null, interlacedMergeMap: DynamicArray<Uint32ArrayConstructor>) {
    const visitedVertices = new BitArray(vertexCount, false);
    const orderedTriangles = triIdxMap === null;

    for (const triangle of triangles) {
        // iterate all 3 vertices of triangle
        const indexOffset = orderedTriangles ? triangle.helper : triIdxMap[triangle.helper];

        for (let v = 0; v < 3; v++) {
            // abort if visited already
            const vIdx = getResolvedIndex(indexOffset + v, indices);
            if (visitedVertices.getAndSet(vIdx, true)) {
                continue;
            }

            // visit vertex star
            const star = triangle.getVertexStar(v);
            for (const [oTriangle, ov] of star) {
                if (oTriangle === triangle && v === ov) {
                    continue;
                }

                // abort if other vertex is already visited, or if resolved
                // index already matches
                const oIndexOffset = orderedTriangles ? oTriangle.helper : triIdxMap[oTriangle.helper];
                const ovIdx = getResolvedIndex(oIndexOffset + ov, indices);
                if (visitedVertices.getAndSet(ovIdx, true) || vIdx === ovIdx) {
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