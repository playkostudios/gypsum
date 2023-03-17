import type { Triangle } from './Triangle';

const NEXT_VERTEX = [ 1, 2, 0 ];
const MISSING_EDGES = [ false, false, false ];

/**
 * Auto-connect edges of a given set of triangles by checking the vertex
 * positions of each triangle in the set. Already connected edges will not be
 * reconnected to other edges.
 *
 * @param triangles - The triangles to auto-connect.
 */
export function autoConnectAllEdges(triangles: Array<Triangle>): void {
    const triCount = triangles.length;
    if (triCount === 0) {
        return;
    }

    for (let ti = 0; ti < triCount; ti++) {
        // check which edges need connections
        const triangle = triangles[ti];
        MISSING_EDGES[0] = !triangle.isEdgeConnected(0);
        MISSING_EDGES[1] = !triangle.isEdgeConnected(1);
        MISSING_EDGES[2] = !triangle.isEdgeConnected(2);
        let edgesLeft = 0;

        if (MISSING_EDGES[0]) {
            edgesLeft++;
        }
        if (MISSING_EDGES[1]) {
            edgesLeft++;
        }
        if (MISSING_EDGES[2]) {
            edgesLeft++;
        }

        // no edges need connections, skip triangle
        if (edgesLeft === 0) {
            continue;
        }

        // some edges need connecting. get positions of each vertex and try
        // connecting to unvisited triangles
        for (let oti = ti + 1; oti < triCount; oti++) {
            // ignore if other triangle is already connected
            const otherTriangle = triangles[oti];
            if (otherTriangle.isEdgeConnected(0) && otherTriangle.isEdgeConnected(1) && otherTriangle.isEdgeConnected(2)) {
                continue;
            }

            // connect if edge positions match
            for (let edgeIdx = 0; edgeIdx < 3; edgeIdx++) {
                if (!MISSING_EDGES[edgeIdx]) {
                    continue;
                }

                // XXX edgeIdx here is actually a vertex index, because it
                //     matches the value
                const match = triangle.getMatchingEdge(edgeIdx, NEXT_VERTEX[edgeIdx], otherTriangle);
                if (match !== null) {
                    MISSING_EDGES[edgeIdx] = false;
                    otherTriangle.connectEdge(match, edgeIdx, triangle);
                    if (--edgesLeft === 0) {
                        break;
                    }
                }
            }

            if (edgesLeft === 0) {
                break;
            }
        }
    }
}