import { vec2 } from 'gl-matrix';
import isClockwise2DPolygon from './is-clockwise-2d-polygon';
import isClockwise2DTriangle from './is-clockwise-2d-triangle';
import sort2DIndices from './sort-2d-indices';

const temp0 = vec2.create();
const temp1 = vec2.create();

function addTriangle(output: Array<number>, index: number, clockwise: boolean, a: number, b: number, c: number, polyline: Array<vec2>): number {
    output[index++] = a;

    if (isClockwise2DTriangle(polyline[a], polyline[b], polyline[c]) === clockwise) {
        output[index++] = b;
        output[index++] = c;
    } else {
        output[index++] = c;
        output[index++] = b;
    }

    return index;
}

function isInInterval(index: number, start: number, end: number) {
    if (start > end) {
        return index >= start || index < end;
    } else {
        return index >= start && index < end;
    }
}

export default function triangulateMonotone2DPolygon(polyline: Array<vec2>, output?: Array<number>, index = 0, isClockwiseHint?: boolean): [trianglesIndices: Array<number>, lastIndex: number] {
    const vertexCount = polyline.length;

    // fast paths (and error conditions):
    if (vertexCount < 3) {
        throw new Error(`Expected input polyline with 3 or more vertices, got ${vertexCount}`);
    }

    const outputSize = index + (vertexCount - 2) * 3;
    if (output) {
        if (output.length < outputSize) {
            output.length = outputSize;
        }
    } else {
        output = new Array(outputSize);
    }

    if (vertexCount === 3) {
        // already a triangle, copy it
        output[index++] = 0;
        output[index++] = 1;
        output[index++] = 2;

        return [output, index];
    }

    // XXX don't do a special case for squares since the square may not be
    // convex and may result in bad triangles

    // general case: using monotone polygon triangulation algorithm from a book:
    // Computational Geometry: Algorithms and Applications (second edition,
    // section 3.3), by Mark de Berg, Marc van Krefeld, and Mark Overmars

    // XXX triangle orientation is very chaotic, so it is properly oriented
    // when inserting each triangle in the output instead of relying of the
    // algorithm's scan order
    if (isClockwiseHint === undefined) {
        isClockwiseHint = isClockwise2DPolygon(polyline);
    }

    // sort vertices by XY respectively
    const indices = sort2DIndices(polyline);
    // XXX a vertex is in the "other"/"second" chain when it comes after or is
    // at the right-most vertex (last in sorted array), and comes before the
    // left-most vertex (first in sorted array)
    const secondChainStart = indices[vertexCount - 1];
    const secondChainEnd = indices[0];
    let stack = [indices[0], indices[1]];

    for (let i = 2; i < vertexCount - 1; i++) {
        const thisIndex = indices[i];
        const stackLen = stack.length;
        const topIndex = stack[stackLen - 1];

        if (isInInterval(thisIndex, secondChainStart, secondChainEnd) !== isInInterval(topIndex, secondChainStart, secondChainEnd)) {
            // opposite chains
            for (let j = 0; j < stackLen - 1; j++) {
                index = addTriangle(output, index, isClockwiseHint, thisIndex, stack[j], stack[j + 1], polyline);
            }

            stack = [topIndex, thisIndex];
        } else {
            // same chain
            let lastPoppedVertex = polyline[topIndex];
            let lastPoppedIndex = topIndex;
            stack.pop();
            const lastDelta = vec2.sub(temp1, lastPoppedVertex, polyline[thisIndex]);

            // swap if delta is going in opposite direction
            if (thisIndex === (lastPoppedIndex + 1) % vertexCount !== isClockwiseHint) {
                vec2.negate(lastDelta, lastDelta);
            }

            while (stack.length > 0) {
                const nextPoppedIndex = stack[stack.length - 1];
                const nextPoppedVertex = polyline[nextPoppedIndex];

                // check if diagonal from current vertex to popped vertex is
                // inside polygon. if not, stop popping
                const delta = vec2.sub(temp0, nextPoppedVertex, lastPoppedVertex);
                const cross = lastDelta[0] * delta[1] - lastDelta[1] * delta[0];

                if (cross <= 0) {
                    break;
                }

                stack.pop();
                index = addTriangle(output, index, isClockwiseHint, thisIndex, lastPoppedIndex, nextPoppedIndex, polyline);
                lastPoppedIndex = nextPoppedIndex;
                lastPoppedVertex = nextPoppedVertex;
            }

            stack.push(lastPoppedIndex);
            stack.push(thisIndex);
        }
    }

    const lastIndex = indices[vertexCount - 1];
    const iterLen = stack.length - 1;

    for (let i = 0; i < iterLen; i++) {
        index = addTriangle(output, index, isClockwiseHint, lastIndex, stack[i], stack[i + 1], polyline);
    }

    return [output, index];
}