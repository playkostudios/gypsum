import { DynamicArray } from './DynamicArray';
import { BitArray } from './BitArray';
import { Triangle } from './Triangle';
import { vec3 } from 'gl-matrix';

function getMatchingEdge(a: vec3, b: vec3, oPos0: vec3, oPos1: vec3, oPos2: vec3): number | null {
    if ((vec3.equals(a, oPos0) && vec3.equals(b, oPos1)) || (vec3.equals(b, oPos0) && vec3.equals(a, oPos1))) {
        return 0;
    } else if ((vec3.equals(a, oPos1) && vec3.equals(b, oPos2)) || (vec3.equals(b, oPos1) && vec3.equals(a, oPos2))) {
        return 1;
    } else if ((vec3.equals(a, oPos2) && vec3.equals(b, oPos0)) || (vec3.equals(b, oPos2) && vec3.equals(a, oPos0))) {
        return 2;
    } else {
        return null;
    }
}

function connectTriangles(ti: number, triangles: Array<Triangle>, visitedTriangles: BitArray) {
    // ignore triangle if already visited
    if (visitedTriangles.get(ti)) {
        return;
    }

    // mark this triangle as visited
    visitedTriangles.set(ti, true);

    // check which edges need connections
    const triangle = triangles[ti];
    const missingEdge0 = triangle.getConnectedEdge(0) === null;
    const missingEdge1 = triangle.getConnectedEdge(1) === null;
    const missingEdge2 = triangle.getConnectedEdge(2) === null;
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
        return;
    }

    // some edges need connecting. get positions of each vertex and try
    // connecting to unvisited triangles
    const pos0 = triangle.getPosition(0);
    const pos1 = triangle.getPosition(1);
    const pos2 = triangle.getPosition(2);

    const triCount = triangles.length;
    const visitQueue: Array<number> = [];
    const edgeHelpers: Array<[missing: boolean, a: vec3, b: vec3]> = [
        [ missingEdge0, pos0, pos1 ],
        [ missingEdge1, pos1, pos2 ],
        [ missingEdge2, pos2, pos0 ],
    ];

    for (let oti = 0; oti < triCount; oti++) {
        // ignore triangles that have already been visited
        if (visitedTriangles.get(oti)) {
            continue;
        }

        // connect if edge positions match
        const otherTriangle = triangles[oti];
        const oPos0 = otherTriangle.getPosition(0);
        const oPos1 = otherTriangle.getPosition(1);
        const oPos2 = otherTriangle.getPosition(2);

        for (let edgeIdx = 0; edgeIdx < 3; edgeIdx++) {
            const edgeHelper = edgeHelpers[edgeIdx];
            const [ missing, a, b ] = edgeHelper;
            if (!missing) {
                continue;
            }

            const match = getMatchingEdge(a, b, oPos0, oPos1, oPos2);
            if (match !== null) {
                edgeHelper[0] = false;
                otherTriangle.connectEdge(match, edgeIdx, triangle);
                visitQueue.push(oti);
                if (--edgesLeft === 0) {
                    break;
                }
            }
        }

        if (edgesLeft === 0) {
            break;
        }
    }

    // visit triangles that were connected
    for (const oti of visitQueue) {
        connectTriangles(oti, triangles, visitedTriangles);
    }
}

export class ManifoldBuilder {
    triangles = new Array<Triangle>();

    /**
     * Auto-connect edges by checking the vertex positions of each triangle.
     * This can fail if the input is not manifold, or there are 2 or more
     * disconnected surfaces.
     */
    autoConnectEdges(): void {
        const triCount = this.triangles.length;
        if (triCount === 0) {
            return;
        }

        // disconnect all edges
        for (const triangle of this.triangles) {
            let i = 0;
            while (i < 3) {
                triangle.disconnectEdge(i++);
            }
        }

        // recursively connect all triangles, starting from the first one
        const visitedTriangles = new BitArray(triCount);
        connectTriangles(0, this.triangles, visitedTriangles);

        // validate that all triangles have been visited. this makes sure that
        // there is only 1 manifold
        if (!visitedTriangles.isAllSet()) {
            throw new Error('Could not connect all triangles; maybe the surface is not fully connected, or the surface is not trivially manifold?');
        }
    }

    // split4(): void {
    //     // TODO
    // }

    // toManifoldMesh(): Mesh {
    //     // TODO
    //     // possible algorithm:
    //     // make a dynamicarray with positions
    //     // preallocate triVerts for manifold, each vertPos index is -1
    //     // for each triangle:
    //     //     for each triangle vertex:
    //     //         get triangle fan of vertex - can either go CW or CCW. make sure not to repeat operations by checking if a loop occurred
    //     //         reuse vertPos index from one of the triangles in the fan, otherwise, make a new vertPos
    //     // turn dynamicarray into vertPos for manifold
    // }
}