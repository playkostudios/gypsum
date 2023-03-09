import type { EdgeList } from './EdgeList';
import type { Triangle } from './Triangle';

/**
 * Similar to {@link autoConnectAllEdges}, but only auto-connects a select set
 * of edges. Edges will not replace already connected triangles. If an edge
 * fails to auto-connect, then an error will be thrown.
 *
 * @param edges - The list of edges to auto-connect. If an edge is not in this list, it will not be auto-connected.
 * @param connectableTriangles - The list of triangles that the edges in the edge list are allowed to connect to.
 */
export function autoConnectEdges(edges: EdgeList, connectableTriangles: Array<Triangle>): void {
    for (const [triangle, edgeIdx] of edges) {
        if (triangle.getConnectedEdge(edgeIdx)) {
            continue; // edge already connected
        }

        const a = edgeIdx, b = (edgeIdx === 2) ? 0 : (edgeIdx + 1);

        let disconnected = true;
        for (const otherTriangle of connectableTriangles) {
            if (triangle === otherTriangle) {
                continue;
            }

            const match = triangle.getMatchingEdge(a, b, otherTriangle);
            if (match !== null) {
                otherTriangle.connectEdge(match, edgeIdx, triangle);
                disconnected = false;
                break;
            }
        }

        if (disconnected) {
            throw new Error('Could not auto-connect edge');
        }
    }
}