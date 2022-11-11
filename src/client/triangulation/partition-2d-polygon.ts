import { vec2 } from 'gl-matrix';
import isClockwise2DPolygon from './is-clockwise-2d-polygon';
import sort2DIndices from './sort-2d-indices';
import split2DPolygon from './split-2d-polygon';

const TAU = Math.PI * 2;

enum VertexType {
    Start,
    End,
    Regular,
    Split,
    Merge
}

function isAbove(p: vec2, q: vec2) {
    return p[0] < q[0] || (p[0] === q[0] && p[1] < q[1]);
}

function interiorAngle(prev: vec2, cur: vec2, next: vec2) {
    // XXX angles must be negated due to CCW winding order
    const prevAngle = -Math.atan2(prev[1] - cur[1], prev[0] - cur[0]);
    const nextAngle = -Math.atan2(next[1] - cur[1], next[0] - cur[0]);
    // XXX mod used instead of remainder because angles can be negative
    return (((nextAngle - prevAngle) % TAU) + TAU) % TAU;
}

function getLeftEdge(polyline: Array<vec2>, status: Set<number>, vertexCount: number, vertex: vec2) {
    let leftEdge = -1;
    let leftY = -Infinity;

    for (const lineStartIndex of status) {
        const lineEndIndex = (lineStartIndex + 1) % vertexCount;
        const lineStart = polyline[lineStartIndex];
        const lineEnd = polyline[lineEndIndex];

        let lineMin, lineMax;
        if (lineStart[0] > lineEnd[0]) {
            lineMin = lineEnd;
            lineMax = lineStart;
        } else {
            lineMax = lineEnd;
            lineMin = lineStart;
        }

        if (vertex[0] >= lineMin[0] && vertex[0] <= lineMax[0]) {
            // y = mx + c; m = dy / dx; c = y - mx
            const m = (lineMax[1] - lineMin[1]) / (lineMax[0] - lineMin[0]);
            const c = lineMin[1] - m * lineMin[0];
            const y = m * vertex[0] + c;

            if (y <= vertex[1] && y >= leftY) {
                leftY = y;
                leftEdge = lineStartIndex;
            }
        }
    }

    if (leftEdge === -1) {
        throw new Error(`No edge to the left of vertex. Status: ${Array.from(status)}`);
    }

    return leftEdge;
}

export default function partition2DPolygon(polyline: Array<vec2>, output?: Array<Array<vec2>>, isClockwiseHint?: boolean) {
    // using monotone polygon partitioning algorithm from a book:
    // Computational Geometry: Algorithms and Applications (second edition,
    // section 3.2), by Mark de Berg, Marc van Krefeld, and Mark Overmars

    // XXX the algorithm assumes that the input polygon is CCW, but sometimes it
    // isn't because a uses wants to make, for example, an inverted extrusion.
    // check for this case
    if (isClockwiseHint === undefined) {
        isClockwiseHint = isClockwise2DPolygon(polyline);
    }

    if (isClockwiseHint) {
        polyline = polyline.slice().reverse();
    }

    // sort vertices in polyline. since our triangulation algorithm sweeps from
    // -X to +X, sort by X values and then Y values, instead of Y then X from
    // the original algorithm
    const vertexCount = polyline.length;
    const helpers = new Map<number, number>();
    // XXX the original algorithm uses a BST for the status container instead of
    // a set, but performance has been OK with a set. maybe change in the
    // future?
    const status = new Set<number>();
    const types = new Map<number, VertexType>();
    const diagonals = new Array<[number, number]>();

    for (const index of sort2DIndices(polyline)) {
        // get vertex type
        const prevIndex = ((index - 1 % vertexCount) + vertexCount) % vertexCount;
        const nextIndex = (index + 1) % vertexCount;
        const prevVertex = polyline[prevIndex];
        const vertex = polyline[index];
        const nextVertex = polyline[nextIndex];

        const abovePrev = isAbove(vertex, prevVertex);
        const aboveNext = isAbove(vertex, nextVertex);

        if (abovePrev && aboveNext) {
            // this is either a start or split vertex. check internal angle
            if (interiorAngle(prevVertex, vertex, nextVertex) < Math.PI) {
                // start vertex
                types.set(index, VertexType.Start);
            } else {
                // split vertex
                types.set(index, VertexType.Split);

                const leftEdge = getLeftEdge(polyline, status, vertexCount, vertex);
                diagonals.push([index, helpers.get(leftEdge) as number]);
                helpers.set(leftEdge, index);
            }

            // shared logic
            status.add(index);
            helpers.set(index, index);

            continue;
        } else if (!abovePrev && !aboveNext) {
            // shared logic
            const prevHelper = helpers.get(prevIndex);
            if (prevHelper !== undefined && types.get(prevHelper) === VertexType.Merge) {
                diagonals.push([index, prevHelper]);
            }

            status.delete(prevIndex);

            // this is either an end or merge vertex. check internal angle
            if (interiorAngle(prevVertex, vertex, nextVertex) < Math.PI) {
                // end vertex
                types.set(index, VertexType.End);
            } else {
                // merge vertex
                types.set(index, VertexType.Merge);

                const leftEdge = getLeftEdge(polyline, status, vertexCount, vertex);
                const leftHelper = helpers.get(leftEdge);
                if (leftHelper !== undefined && types.get(leftHelper) === VertexType.Merge) {
                    diagonals.push([index, leftHelper]);
                }

                helpers.set(leftEdge, index);
            }

            continue;
        }

        // regular vertex
        types.set(index, VertexType.Regular);

        // check if interior lies to the right of the vertex. on a CCW polygon,
        // the polygon interior always lies to the left of an edge, meaning that
        // the interior lies to the right of a vertex when the edge to the next
        // vertex is below the vertex
        if (nextVertex[0] > vertex[0]) {
            // interior to the right
            const prevHelper = helpers.get(prevIndex);
            if (prevHelper !== undefined && types.get(prevHelper) === VertexType.Merge) {
                diagonals.push([index, prevHelper]);
            }

            status.delete(prevIndex);
            status.add(index);
            helpers.set(index, index);
        } else {
            // interior not to the right
            const leftEdge = getLeftEdge(polyline, status, vertexCount, vertex);
            const leftHelper = helpers.get(leftEdge);
            if (leftHelper !== undefined && types.get(leftHelper) === VertexType.Merge) {
                diagonals.push([index, leftHelper]);
            }

            helpers.set(leftEdge, index);
        }
    }

    // get all partitions by finding all loops in the graph made by the original
    // polyline and diagonals
    return split2DPolygon(polyline, diagonals, output, isClockwiseHint);
}