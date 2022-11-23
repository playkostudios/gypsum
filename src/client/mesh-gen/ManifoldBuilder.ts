import { DynamicArray } from './DynamicArray';
import { BitArray } from './BitArray';
import { Triangle } from './Triangle';
import { vec3 } from 'gl-matrix';
import { BaseManifoldWLMesh, Submesh } from '../BaseManifoldWLMesh';
import VertexHasher from './VertexHasher';

import type { vec2 } from 'gl-matrix';
import { normalFromTriangle } from './normal-from-triangle';

function getMatchingEdge(a: vec3, b: vec3, oPos0: vec3, oPos1: vec3, oPos2: vec3): number | null {
    // TODO make a decision tree instead of this innefficient abomination
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

// XXX this whole class could be optimised by having a
// WL.Mesh.isAttributeAvailable API, and a pipeline API, so that we could choose
// whether or not to generate normals and UVs, but there's nothing i can do
// about it for now (the isAttributeAvailable feature could be hacked in, but
// it's very ugly and i'd rather wait)
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

    addTriangle(pos0: Readonly<vec3>, pos1: Readonly<vec3>, pos2: Readonly<vec3>): Triangle;
    addTriangle(pos0: Readonly<vec3>, pos1: Readonly<vec3>, pos2: Readonly<vec3>, normal0: Readonly<vec3>, normal1: Readonly<vec3>, normal2: Readonly<vec3>): Triangle;
    addTriangle(pos0: Readonly<vec3>, pos1: Readonly<vec3>, pos2: Readonly<vec3>, uv0: Readonly<vec2>, uv1: Readonly<vec2>, uv2: Readonly<vec2>): Triangle;
    addTriangle(pos0: Readonly<vec3>, pos1: Readonly<vec3>, pos2: Readonly<vec3>, normal0: Readonly<vec3>, normal1: Readonly<vec3>, normal2: Readonly<vec3>, uv0: Readonly<vec2>, uv1: Readonly<vec2>, uv2: Readonly<vec2>): Triangle;
    addTriangle(pos0: Readonly<vec3>, pos1: Readonly<vec3>, pos2: Readonly<vec3>, uvNormal0?: Readonly<vec3> | Readonly<vec2>, uvNormal1?: Readonly<vec3> | Readonly<vec2>, uvNormal2?: Readonly<vec3> | Readonly<vec2>, uv0?: Readonly<vec2>, uv1?: Readonly<vec2>, uv2?: Readonly<vec2>): Triangle {
        // TODO add hard normals if no vertex normals were supplied
        const triangle = new Triangle();
        triangle.setPosition(0, pos0);
        triangle.setPosition(1, pos1);
        triangle.setPosition(2, pos2);

        let needsHardNormals = true;

        if (uv0) {
            needsHardNormals = false;
            triangle.setNormal(0, uvNormal0 as vec3);
            triangle.setNormal(1, uvNormal1 as vec3);
            triangle.setNormal(2, uvNormal2 as vec3);
            triangle.setUV(0, uv0);
            triangle.setUV(1, uv1 as vec2);
            triangle.setUV(2, uv2 as vec2);
        } else if (uvNormal0) {
            if (uvNormal0.length === 2) {
                triangle.setUV(0, uvNormal0);
                triangle.setUV(1, uvNormal1 as vec2);
                triangle.setUV(2, uvNormal2 as vec2);
            } else {
                needsHardNormals = false;
                triangle.setNormal(0, uvNormal0 as vec3);
                triangle.setNormal(1, uvNormal1 as vec3);
                triangle.setNormal(2, uvNormal2 as vec3);
            }
        }

        if (needsHardNormals) {
            const temp = normalFromTriangle(pos0, pos1, pos2);
            triangle.setNormal(0, temp);
            triangle.setNormal(1, temp);
            triangle.setNormal(2, temp);
        }

        this.triangles.push(triangle);
        return triangle;
    }

    subDivide4(): void {
        // TODO teehee i literally do nothing
    }

    normalize(): void {
        for (const triangle of this.triangles) {
            triangle.normalize();
        }
    }

    private submeshToWLMeshPair(material: WL.Material, triangles: Array<Triangle>): Submesh {
        // make index and vertex data in advance
        const triCount = triangles.length;
        // XXX this assumes the worst case; that no vertices are merged
        const indexCount = triCount * 3;
        const [indexData, indexType] = BaseManifoldWLMesh.makeIndexBuffer(indexCount, indexCount);
        const positions = new DynamicArray(Float32Array);
        const normals = new DynamicArray(Float32Array);
        const texCoords = new DynamicArray(Float32Array);

        const hasher = new VertexHasher(8);
        let nextIdx = 0;

        for (let t = 0, iOffset = 0; t < triCount; t++) {
            const triangle = triangles[t];

            for (let i = 0, offset = 0; i < 3; i++, offset += 8) {
                let offsetCopy = offset;
                const x = triangle.vertexData[offsetCopy++];
                const y = triangle.vertexData[offsetCopy++];
                const z = triangle.vertexData[offsetCopy++];
                const nx = triangle.vertexData[offsetCopy++];
                const ny = triangle.vertexData[offsetCopy++];
                const nz = triangle.vertexData[offsetCopy++];
                const u = triangle.vertexData[offsetCopy++];
                const v = triangle.vertexData[offsetCopy];

                if (hasher.isUnique(triangle.vertexData, offset)) {
                    // console.log('UNIQUE');
                    positions.pushBack_guarded(x);
                    positions.pushBack_guarded(y);
                    positions.pushBack_guarded(z);

                    normals.pushBack_guarded(nx);
                    normals.pushBack_guarded(ny);
                    normals.pushBack_guarded(nz);

                    texCoords.pushBack_guarded(u);
                    texCoords.pushBack_guarded(v);

                    indexData[iOffset++] = nextIdx++;
                } else {
                    // console.log('NOT UNIQUE');
                    let j = 0;
                    for (let k2 = 0, k3 = 0; j < nextIdx; j++, k2 += 2, k3 += 3) {
                        if (positions.get_guarded(k3) === x && positions.get_guarded(k3 + 1) === y && positions.get_guarded(k3 + 2) === z &&
                            normals.get_guarded(k3) === nx && normals.get_guarded(k3 + 1) === ny && normals.get_guarded(k3 + 2) === nz &&
                            texCoords.get_guarded(k2) === u && texCoords.get_guarded(k2 + 1) === v) {
                            break;
                        }
                    }

                    if (j === nextIdx) {
                        throw new Error('Vertex was hashed, but not found in list of vertices');
                    }

                    indexData[iOffset++] = j;
                }
            }
        }

        // instance one mesh
        const vertexCount = positions.length / 3;
        console.log('done indices', indexCount, 'vertices', vertexCount);
        const mesh = new WL.Mesh({ vertexCount, indexData, indexType });

        // upload vertex data
        const positionsAttr = mesh.attribute(WL.MeshAttribute.Position);
        if (!positionsAttr) {
            throw new Error('Could not get position mesh attribute accessor');
        }
        positionsAttr.set(0, positions.finalize());

        const normalsAttr = mesh.attribute(WL.MeshAttribute.Normal);
        if (normalsAttr) {
            normalsAttr.set(0, normals.finalize());
        }

        const texCoordsAttr = mesh.attribute(WL.MeshAttribute.TextureCoordinate);
        if (texCoordsAttr) {
            texCoordsAttr.set(0, texCoords.finalize());
        }

        return [mesh, material];
    }

    toWLMeshArray(materialMap: Map<number, WL.Material>): Array<Submesh> {
        // group all triangles together by their materials
        const groupedTris = new Map<WL.Material, Array<Triangle>>();

        for (const triangle of this.triangles) {
            const materialID = triangle.materialID;
            const material = materialMap.get(materialID) ?? null;
            const submesh = groupedTris.get(material);
            if (submesh) {
                submesh.push(triangle);
            } else {
                groupedTris.set(material, [triangle]);
            }
        }

        // turn groups into submeshes
        const submeshes = new Array<Submesh>();
        for (const [material, triangles] of groupedTris) {
            submeshes.push(this.submeshToWLMeshPair(material, triangles));
        }

        return submeshes;
    }

    toManifoldMesh(): void {
        // TODO actually return a mesh. use new mesh api which uses float32array

        // prepare mesh data arrays
        const positions = new DynamicArray(Float32Array);
        let nextPosition = 0;
        const triCount = this.triangles.length;
        const indices = new Uint32Array(triCount * 3);
        const INVALID_INDEX = 0xFFFFFFFF; // max uint32
        indices.fill(INVALID_INDEX);

        // map triangles back to their indices in the triangles array
        for (let i = 0; i < triCount; i++) {
            this.triangles[i].helper = i;
        }

        // get positions for each triangle
        for (let t = 0; t < triCount; t++) {
            const indexOffset = t * 3;
            const triangle = this.triangles[t];

            for (let vi = 0; vi < 3; vi++) {
                let index = indices[indexOffset + vi];

                if (index !== INVALID_INDEX) {
                    continue; // vertex already has shared position
                }

                // no shared position yet, make a new position
                index = nextPosition++;
                const vertPos = triangle.getPosition(vi);
                positions.pushBack_guarded(vertPos[0]);
                positions.pushBack_guarded(vertPos[1]);
                positions.pushBack_guarded(vertPos[2]);

                // set all positions in vertex star
                const vertexStar = triangle.getVertexStar(vi);
                for (const [otherTriangle, ovi] of vertexStar) {
                    indices[otherTriangle.helper * 3 + ovi] = index;
                }
            }
        }

        const finalPositions = positions.finalize();
        console.log(indices, finalPositions);
    }
}