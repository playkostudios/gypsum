import type { Triangle } from './Triangle';

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
        const missingEdge0 = !triangle.isEdgeConnected(0);
        const missingEdge1 = !triangle.isEdgeConnected(1);
        const missingEdge2 = !triangle.isEdgeConnected(2);
        let edgesLeft = 0;

        if (missingEdge0) {
            edgesLeft++;
        }
        if (missingEdge1) {
            edgesLeft++;
        }
        if (missingEdge2) {
            edgesLeft++;
        }

        // no edges need connections, skip triangle
        if (edgesLeft === 0) {
            continue;
        }

        // some edges need connecting. get positions of each vertex and try
        // connecting to unvisited triangles
        const edgeHelpers: Array<[missing: boolean, a: number, b: number]> = [
            [ missingEdge0, 0, 1 ],
            [ missingEdge1, 1, 2 ],
            [ missingEdge2, 2, 0 ],
        ];

        for (let oti = ti + 1; oti < triCount; oti++) {
            // ignore if other triangle is already connected
            const otherTriangle = triangles[oti];
            const oMissingEdge0 = !otherTriangle.isEdgeConnected(0);
            const oMissingEdge1 = !otherTriangle.isEdgeConnected(1);
            const oMissingEdge2 = !otherTriangle.isEdgeConnected(2);
            let oEdgesLeft = 0;

            if (oMissingEdge0) {
                oEdgesLeft++;
            }
            if (oMissingEdge1) {
                oEdgesLeft++;
            }
            if (oMissingEdge2) {
                oEdgesLeft++;
            }

            if (oEdgesLeft === 0) {
                continue;
            }

            // connect if edge positions match
            for (let edgeIdx = 0; edgeIdx < 3; edgeIdx++) {
                const edgeHelper = edgeHelpers[edgeIdx];
                const [ missing, a, b ] = edgeHelper;
                if (!missing) {
                    continue;
                }

                const match = triangle.getMatchingEdge(a, b, otherTriangle);
                if (match !== null) {
                    edgeHelper[0] = false;
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