import { BitArray } from './BitArray';

import type { DynamicArray } from '../../common/DynamicArray';
import type { Triangle } from './Triangle';

/**
 * A helper list containing necessary ranges for visiting an index buffer, and
 * that index buffer.
 */
export type IndexRangeList = Array<[vertexStart: number, indexStart: number, indexEnd: number, indexData: Uint8Array | Uint16Array | Uint32Array | null]>;

function getResolvedIndex(index: number, indices: IndexRangeList): number {
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

/**
 * Generate an interlaced MergeMap. The MergeMap should then be de-interlaced so
 * it can be used for Manifold.
 *
 * @param triangles - The list of triangles to get connectivity from
 * @param vertexCount - The number of vertices (not indices) required by the triangles
 * @param indices - A list of the necessary ranges for visiting an index buffer, and that index buffer
 * @param triIdxMap - A list of indices that maps a Triangle to the index of the first vertex of the triangle in an index buffer. If null, only the triangle helpers are used instead, and the index buffer is assumed to bne in the order of the triangles list
 * @param interlacedMergeMap - An output buffer to store the interlaced MergeMap
 */
export function genInterlacedMergeMap(triangles: Array<Triangle>, vertexCount: number, indices: IndexRangeList, triIdxMap: Uint32Array | null, interlacedMergeMap: DynamicArray<Uint32ArrayConstructor>) {
    const visitedVertices = new BitArray(vertexCount, false);
    const orderedTriangles = triIdxMap === null;

    for (const triangle of triangles) {
        // iterate all 3 vertices of triangle
        const indexOffset = orderedTriangles ? (triangle.helper * 3) : triIdxMap[triangle.helper];

        for (let v = 0; v < 3; v++) {
            // abort if visited already
            const vIdx = getResolvedIndex(indexOffset + v, indices);
            if (visitedVertices.getAndSet(vIdx, true)) {
                continue;
            }

            // visit vertex star
            for (const [oTriangle, ov] of triangle.getVertexStar(v)) {
                if (oTriangle === triangle && v === ov) {
                    continue;
                }

                // abort if other vertex is already visited, or if resolved
                // index already matches
                const oIndexOffset = orderedTriangles ? (oTriangle.helper * 3) : triIdxMap[oTriangle.helper];
                const ovIdx = getResolvedIndex(oIndexOffset + ov, indices);
                if (visitedVertices.getAndSet(ovIdx, true) || vIdx === ovIdx) {
                    continue;
                }

                // add to merge map
                interlacedMergeMap.expandCapacity(interlacedMergeMap.length + 2);
                interlacedMergeMap.pushBack(ovIdx);
                interlacedMergeMap.pushBack(vIdx);
            }
        }
    }

    if (!visitedVertices.isAllSet()) {
        throw new Error('Not all vertices were visited. Maybe the input mesh is not manifold?');
    }
}