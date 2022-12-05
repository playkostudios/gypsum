import { vec2 } from 'gl-matrix';

function getPolygonInLoop(indices: Array<number>, start: number, end: number): Array<number> {
    const indexCount = indices.length;
    const output: Array<number> = [start];

    for (let i = (indices.indexOf(start) + 1) % indexCount;; i = (i + 1) % indexCount) {
        const actualIndex = indices[i];
        output.push(actualIndex);

        if (actualIndex === end) {
            return output;
        } else if (actualIndex === start) {
            throw new Error(`getPolygonInLoop aborted; infinite loop detected due to possibly invalid split diagonal (${start}, ${end})`);
        }
    }
}

function splitPolygonTo(polyline: Array<vec2>, indices: Array<number>, diagonals: Array<[number, number]>, output: Array<Array<vec2>>, flip: boolean) {
    if (diagonals.length > 0) {
        // split along first diagonal
        const [start, end] = diagonals[0];
        const aIndices = getPolygonInLoop(indices, start, end);
        const bIndices = getPolygonInLoop(indices, end, start);

        // assign other diagonals to one of the partitions
        const aDiags = new Array<[number, number]>(), bDiags = new Array<[number, number]>();
        const diagonalCount = diagonals.length;
        for (let i = 1; i < diagonalCount; i++) {
            const [oStart, oEnd] = diagonals[i];

            if (aIndices.indexOf(oStart) >= 0 && aIndices.indexOf(oEnd) >= 0) {
                aDiags.push([oStart, oEnd]);
            } else if (bIndices.indexOf(oStart) >= 0 && bIndices.indexOf(oEnd) >= 0) {
                bDiags.push([oStart, oEnd]);
            } else {
                throw new Error(`Invalid split diagonal (${oStart}, ${oEnd})`);
            }
        }

        // further split
        splitPolygonTo(polyline, aIndices, aDiags, output, flip);
        splitPolygonTo(polyline, bIndices, bDiags, output, flip);
    } else {
        // no more diagonals, make actual polyline
        const indexCount = indices.length;
        const outPolyline = new Array(indexCount);

        if (flip) {
            for (let i = 0; i < indexCount; i++) {
                outPolyline[i] = polyline[indices[indexCount - 1 - i]];
            }
        } else {
            for (let i = 0; i < indexCount; i++) {
                outPolyline[i] = polyline[indices[i]];
            }
        }

        output.push(outPolyline);
    }
}

/**
 * Split a polyline by a list of diagonals.
 *
 * @param polyline - The polyline to split.
 * @param diagonals - The diagonals to split the polyline by. For example, if a diagonal is [0, 3], then the polyline will be split into 2 polylines, where there is a new edge from the index 0 to index 3.
 * @param output - An array to append the outputs to.
 * @param flip - If true, then the output polylines will have their winding order flipped. False by default.
 */
export default function split2DPolygon(polyline: Array<vec2>, diagonals: Array<[number, number]>, output?: Array<Array<vec2>>, flip = false): Array<Array<vec2>> {
    if (!output) {
        output = [];
    }

    splitPolygonTo(polyline, Array.from({ length: polyline.length }, (_, i) => i), diagonals, output, flip);
    return output;
}