import { DynamicArray } from './DynamicArray';
import { BitArray } from './BitArray';
import { Triangle } from './Triangle';
import { vec2, vec3, mat4 } from 'gl-matrix';
import { BaseManifoldWLMesh, Submesh, SubmeshMap } from '../BaseManifoldWLMesh';
import VertexHasher from './VertexHasher';
import { normalFromTriangle } from './normal-from-triangle';

import type { quat } from 'gl-matrix';
import type { StrippedMesh } from '../../common/StrippedMesh';

const MAT4_IDENTITY = mat4.create();
const TAU_INV = 1 / (Math.PI * 2);

export type EdgeList = Array<[triangle: Triangle, edgeIdx: number]>;

function getMatchingEdge(a: vec3, b: vec3, oPos0: vec3, oPos1: vec3, oPos2: vec3): number | null {
    // XXX check that the check for opposite winding order edges really is not
    // necessary (commented code). for now it seems to work perfectly fine
    if (vec3.exactEquals(a, oPos0)) {
        /*if (vec3.exactEquals(b, oPos1)) {
            return 0;
        } else*/ if (vec3.exactEquals(b, oPos2)) {
            return 2;
        }
    } else if (vec3.exactEquals(a, oPos1)) {
        /*if (vec3.exactEquals(b, oPos2)) {
            return 1;
        } else*/ if (vec3.exactEquals(b, oPos0)) {
            return 0;
        }
    } else if (vec3.exactEquals(a, oPos2)) {
        /*if (vec3.exactEquals(b, oPos0)) {
            return 2;
        } else*/ if (vec3.exactEquals(b, oPos1)) {
            return 1;
        }
    }

    return null;
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

function getVertexMid(a: Float32Array, b: Float32Array): Float32Array {
    const result = new Float32Array(8);

    for (let i = 0; i < 8; i++) {
        result[i] = (a[i] + b[i]) * 0.5;
    }

    return result;
}

function sortMaterials(materials: Iterable<WL.Material | null>, materialMap: Map<number, WL.Material>): Array<number | null> {
    // reverse the material map (map materials to material IDs)
    const revMaterialMap = new Map<WL.Material, number>();
    for (const [id, material] of materialMap) {
        revMaterialMap.set(material, id);
    }

    // sort materials by id (and handle nulls)
    return Array.from(materials).sort((a, b) => {
        if (a === null) {
            return -1;
        } else if (b === null) {
            return 1;
        }

        const aID = revMaterialMap.get(a) as number;
        const bID = revMaterialMap.get(b) as number;

        if (aID < bID) {
            return -1;
        } else if (aID > bID) {
            return 1;
        } else {
            return 0;
        }
    });
}

// XXX this whole class could be optimised by having a
// WL.Mesh.isAttributeAvailable API, and a pipeline API, so that we could choose
// whether or not to generate normals and UVs, but there's nothing i can do
// about it for now (the isAttributeAvailable feature could be hacked in, but
// it's very ugly and i'd rather wait)
export class ManifoldBuilder {
    /**
     * The list of all triangles in this manifold. Note that this array might be
     * detached from the builder and replaced with a new array. It is safe to
     * use between operations, but when doing some operations such as
     * subDivide4, a new array will be created.
     */
    triangles = new Array<Triangle>();

    /**
     * Auto-connect all edges by checking the vertex positions of each triangle.
     * This can fail if the input is not manifold, or there are 2 or more
     * disconnected surfaces.
     */
    autoConnectAllEdges(): void {
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

    /**
     * Similar to {@link autoConnectAllEdges}, but only auto-connects a subset
     * of the mesh, given as a list of Triangles.
     */
    autoConnectSubset(triangles: Array<Triangle>): void {
        const triCount = this.triangles.length;
        if (triCount === 0) {
            return;
        }

        const visitedTriangles = new BitArray(triCount);
        connectTriangles(0, triangles, visitedTriangles);
    }

    /**
     * Similar to {@link autoConnectSubset}, but only auto-connects a select set
     * of edges. Edges will not replace already connected triangles. If an edge
     * fails to auto-connect, then an error will be thrown.
     */
    autoConnectEdges(edges: EdgeList, connectableTriangles: Array<Triangle>): void {
        for (const [triangle, edgeIdx] of edges) {
            if (triangle.getConnectedEdge(edgeIdx)) {
                continue; // edge already connected
            }

            let a: vec3, b: vec3;
            switch (edgeIdx) {
                case 0:
                    a = triangle.getPosition(0);
                    b = triangle.getPosition(1);
                    break;
                case 1:
                    a = triangle.getPosition(1);
                    b = triangle.getPosition(2);
                    break;
                case 2:
                    a = triangle.getPosition(2);
                    b = triangle.getPosition(0);
                    break;
                default:
                    throw new Error(`Invalid edge index (${edgeIdx})`);
            }

            let disconnected = true;
            for (const otherTriangle of connectableTriangles) {
                if (triangle === otherTriangle) {
                    continue;
                }

                const pos0 = otherTriangle.getPosition(0);
                const pos1 = otherTriangle.getPosition(1);
                const pos2 = otherTriangle.getPosition(2);
                const match = getMatchingEdge(a, b, pos0, pos1, pos2);

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

    addTriangleNoNormals(pos0: Readonly<vec3>, pos1: Readonly<vec3>, pos2: Readonly<vec3>): Triangle;
    addTriangleNoNormals(pos0: Readonly<vec3>, pos1: Readonly<vec3>, pos2: Readonly<vec3>, uv0: Readonly<vec2>, uv1: Readonly<vec2>, uv2: Readonly<vec2>): Triangle;
    addTriangleNoNormals(pos0: Readonly<vec3>, pos1: Readonly<vec3>, pos2: Readonly<vec3>, uv0?: Readonly<vec2>, uv1?: Readonly<vec2>, uv2?: Readonly<vec2>): Triangle {
        const triangle = new Triangle();
        triangle.setPosition(0, pos0);
        triangle.setPosition(1, pos1);
        triangle.setPosition(2, pos2);

        if (uv0) {
            triangle.setUV(0, uv0);
            triangle.setUV(1, uv1 as vec2);
            triangle.setUV(2, uv2 as vec2);
        }

        this.triangles.push(triangle);
        return triangle;
    }

    addTriangle(pos0: Readonly<vec3>, pos1: Readonly<vec3>, pos2: Readonly<vec3>): Triangle;
    addTriangle(pos0: Readonly<vec3>, pos1: Readonly<vec3>, pos2: Readonly<vec3>, normal0: Readonly<vec3>, normal1: Readonly<vec3>, normal2: Readonly<vec3>): Triangle;
    addTriangle(pos0: Readonly<vec3>, pos1: Readonly<vec3>, pos2: Readonly<vec3>, uv0: Readonly<vec2>, uv1: Readonly<vec2>, uv2: Readonly<vec2>): Triangle;
    addTriangle(pos0: Readonly<vec3>, pos1: Readonly<vec3>, pos2: Readonly<vec3>, normal0: Readonly<vec3>, normal1: Readonly<vec3>, normal2: Readonly<vec3>, uv0: Readonly<vec2>, uv1: Readonly<vec2>, uv2: Readonly<vec2>): Triangle;
    addTriangle(pos0: Readonly<vec3>, pos1: Readonly<vec3>, pos2: Readonly<vec3>, uvNormal0?: Readonly<vec3> | Readonly<vec2>, uvNormal1?: Readonly<vec3> | Readonly<vec2>, uvNormal2?: Readonly<vec3> | Readonly<vec2>, uv0?: Readonly<vec2>, uv1?: Readonly<vec2>, uv2?: Readonly<vec2>): Triangle {
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

    addSubdivQuad(tlPos: vec3, trPos: vec3, blPos: vec3, brPos: vec3, subDivisions = 1, tlUV?: vec2, trUV?: vec2, blUV?: vec2, brUV?: vec2): void {
        const subDivisionsP1 = subDivisions + 1;
        const subQuads = subDivisionsP1 * subDivisionsP1;

        // pre-calculate all positions (and uvs)
        const positions = new Array<vec3>(subQuads);
        let uvs: null | Array<vec2> = null;

        if (tlUV) {
            // assume other uv coordinates are supplied
            uvs = new Array<vec2>(subQuads);
        }

        for (let j = 0; j <= subDivisions; j++) {
            // j goes from top to bottom
            const j0 = (subDivisions - j) / subDivisions;
            const j1 = j / subDivisions;
            const stride = subDivisions * j;

            for (let i = 0; i <= subDivisions; i++) {
                // i goes from left to right
                const i0 = (subDivisions - i) / subDivisions;
                const i1 = i / subDivisions;

                // do bilinear interpolation for position
                const pos = vec3.scale(vec3.create(), tlPos, i0 * j0);
                vec3.scaleAndAdd(pos, pos, trPos, i1 * j0);
                vec3.scaleAndAdd(pos, pos, blPos, i0 * j1);
                vec3.scaleAndAdd(pos, pos, brPos, i1 * j1);
                positions[stride + i] = pos;

                if (uvs) {
                    // do bilinear interpolation for uvs
                    const uv = vec2.scale(vec2.create(), tlUV as vec2, i0 * j0);
                    vec2.scaleAndAdd(uv, uv, trUV as vec2, i1 * j0);
                    vec2.scaleAndAdd(uv, uv, blUV as vec2, i0 * j1);
                    vec2.scaleAndAdd(uv, uv, brUV as vec2, i1 * j1);
                    uvs[stride + i] = uv;
                }
            }
        }

        // pre-calculate quad normal
        const normal = normalFromTriangle(tlPos, blPos, trPos, vec3.create());

        // make triangles
        for (let j = 0; j < subDivisions; j++) {
            const stride = subDivisions * j;

            for (let i = 0; i < subDivisions; i++) {
                const o00 = stride + i;
                const o10 = o00 + 1;
                const o01 = o00 + subDivisions;
                const o11 = o01 + 1;

                const tlTri = this.addTriangle(positions[o00], positions[o01], positions[o10], normal, normal, normal);
                const brTri = this.addTriangle(positions[o10], positions[o01], positions[o11], normal, normal, normal);

                if (uvs) {
                    tlTri.setUV(0, uvs[o00]);
                    tlTri.setUV(1, uvs[o01]);
                    tlTri.setUV(2, uvs[o10]);
                    brTri.setPosition(0, positions[o10]);
                    brTri.setPosition(1, positions[o01]);
                    brTri.setPosition(2, positions[o11]);
                }
            }
        }
    }

    subDivide4(): void {
        // split triangle into 4, in the same order as the original array.
        // triangles:
        // 0: top triangle (0, 0-1 mid, 2-0 mid)
        // 1: bottom left triangle (0-1 mid, 1, 1-2 mid)
        // 2: bottom right triangle (2-0 mid, 1-2 mid, 2)
        // 3: middle triangle (1-2 mid, 2-0 mid, 0-1 mid)
        const triCount = this.triangles.length;
        const newTriangles = new Array<Triangle>(triCount * 4);

        for (let t = 0, i = 0; t < triCount; t++) {
            const triangle = this.triangles[t];

            // pre-calculate vertices
            const vert0 = triangle.getVertex(0);
            const vert1 = triangle.getVertex(1);
            const vert2 = triangle.getVertex(2);
            const vert01 = getVertexMid(vert0, vert1);
            const vert12 = getVertexMid(vert1, vert2);
            const vert20 = getVertexMid(vert2, vert0);

            // make triangles
            const tTri = Triangle.fromVertices(vert0, vert01, vert20);
            const blTri = Triangle.fromVertices(vert01, vert1, vert12);
            const brTri = Triangle.fromVertices(vert20, vert12, vert2);
            const mTri = Triangle.fromVertices(vert12, vert20, vert01);

            // connect edges of mid triangle
            mTri.connectEdge(0, 0, brTri);
            mTri.connectEdge(1, 1, tTri);
            mTri.connectEdge(2, 2, blTri);

            // save triangles
            newTriangles[i++] = tTri;
            newTriangles[i++] = blTri;
            newTriangles[i++] = brTri;
            newTriangles[i++] = mTri;
        }

        // connect triangles according to original shared edges
        // XXX there are a lot of redundant operations, but i feel like trying
        // to reduce them would be more expensive than keeping it as is
        this.setTriangleHelpers();

        for (let t = 0, i = 0; t < triCount; t++, i += 4) {
            const origTri = this.triangles[t];

            for (let edge = 0; edge < 3; edge++) {
                const edgeConnection = origTri.getConnectedEdge(edge);
                if (edgeConnection) {
                    const [otherEdge, otherTri] = edgeConnection;
                    const ot = otherTri.helper * 4;
                    const oaSubTri = newTriangles[ot + otherEdge];
                    const obSubTri = newTriangles[ot + (otherEdge + 1) % 3];
                    newTriangles[i + edge].connectEdge(edge, otherEdge, obSubTri);
                    newTriangles[i + (edge + 1) % 3].connectEdge(edge, otherEdge, oaSubTri);
                }
            }
        }

        // replace triangle array
        this.triangles = newTriangles;
    }

    normalize(): void {
        for (const triangle of this.triangles) {
            triangle.normalize();
        }
    }

    private finalizeSubmesh(material: WL.Material, triangles: Array<Triangle>, submeshMap: SubmeshMap, submeshIdx: number): Submesh {
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
            const smOffset = triangle.helper * 2;
            submeshMap[smOffset] = submeshIdx;
            submeshMap[smOffset + 1] = t;

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

    private checkConnected(triangle: Triangle, reached: BitArray): void {
        if (reached.get(triangle.helper)) {
            return;
        }

        reached.set(triangle.helper, true);

        const otherA = triangle.getConnectedEdge(0);
        if (otherA) {
            this.checkConnected(otherA[1], reached);
        }

        const otherB = triangle.getConnectedEdge(1);
        if (otherB) {
            this.checkConnected(otherB[1], reached);
        }

        const otherC = triangle.getConnectedEdge(2);
        if (otherC) {
            this.checkConnected(otherC[1], reached);
        }
    }

    get isConnected(): boolean {
        this.setTriangleHelpers();
        const reached = new BitArray(this.triangles.length);
        this.checkConnected(this.triangles[0], reached);
        return reached.isAllSet();
    }

    finalize(materialMap: Map<number, WL.Material>): [ submeshes: Array<Submesh>, manifoldMesh: StrippedMesh, submeshMap: SubmeshMap ] {
        // verify that mesh if fully connected. this doesn't mean that the mesh
        // is a manifold
        if (!this.isConnected) {
            throw new Error('Mesh is not connected');
        }

        // group all triangles together by their materials
        const groupedTris = new Map<WL.Material | null, Array<Triangle>>();

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

        // sort materials by ascending material ID
        const sortedMaterials = sortMaterials(groupedTris.keys(), materialMap);

        // count maximum triangle count for each group
        let maxSubmeshTriCount = 0;
        for (const triangles of groupedTris.values()) {
            maxSubmeshTriCount = Math.max(maxSubmeshTriCount, triangles.length);
        }

        // turn groups into submeshes
        const triCount = this.triangles.length;
        const submeshes = new Array<Submesh>();
        const submeshMap: SubmeshMap = BaseManifoldWLMesh.makeSubmeshMapBuffer(triCount, maxSubmeshTriCount, groupedTris.size - 1);
        let submeshIdx = 0;
        this.setTriangleHelpers();

        for (const material of sortedMaterials) {
            const triangles = groupedTris.get(material) as Array<Triangle>;
            submeshes.push(this.finalizeSubmesh(material, triangles, submeshMap, submeshIdx++));
        }

        // prepare manifold mesh data arrays
        const positions = new DynamicArray(Float32Array);
        let nextPosition = 0;
        const indices = new Uint32Array(triCount * 3);
        const INVALID_INDEX = 0xFFFFFFFF; // max uint32
        indices.fill(INVALID_INDEX);

        this.setTriangleHelpers();

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

        const manifoldMesh = <StrippedMesh>{
            triVerts: indices,
            vertPos: positions.finalize()
        };

        return [submeshes, manifoldMesh, submeshMap];
    }

    translate(offset: vec3): void {
        if (offset[0] === 0 && offset[1] === 0 && offset[2] === 0) {
            return;
        }

        for (const triangle of this.triangles) {
            triangle.translate(offset);
        }
    }

    scale(factor: vec3): void {
        if (factor[0] === 1 && factor[1] === 1 && factor[2] === 1) {
            return;
        }

        for (const triangle of this.triangles) {
            triangle.scale(factor);
        }
    }

    uniformScale(factor: number): void {
        if (factor === 1) {
            return;
        }

        for (const triangle of this.triangles) {
            triangle.uniformScale(factor);
        }
    }

    rotate(rotation: quat): void {
        if (rotation[0] === 0 && rotation[1] === 0 && rotation[2] === 0 && rotation[3] === 1) {
            return;
        }

        for (const triangle of this.triangles) {
            triangle.rotate(rotation);
        }
    }

    transform(matrix: mat4): void {
        if (mat4.exactEquals(matrix, MAT4_IDENTITY)) {
            return;
        }

        for (const triangle of this.triangles) {
            triangle.transform(matrix);
        }
    }

    /**
     * Map triangles back to their indices in the triangles array by setting the
     * helper variable of each triangle.
     */
    setTriangleHelpers(): void {
        const triCount = this.triangles.length;
        for (let i = 0; i < triCount; i++) {
            this.triangles[i].helper = i;
        }
    }

    /**
     * Make UVs for an equirectangular projection. The mapping will always be
     * heavily distorted near the poles as it is impossible to do
     * equirectangular projections properly without custom shaders.
     *
     * Generally, more subdivisions lead to better mappings, but this has
     * diminishing returns.
     */
    makeEquirectUVs(): void {
        const uList = new Array(3);

        for (const triangle of this.triangles) {
            // check if on first or second half of sphere (along yaw)
            let isFirstHalf = false;
            for (let offset = 0, i = 0; offset < 24; offset += 8, i++) {
                // calculate yaw and pitch from normalized position
                const dx = triangle.vertexData[offset];
                const dy = triangle.vertexData[offset + 1];
                const dz = triangle.vertexData[offset + 2];
                const u = Math.atan2(dx, dz) * TAU_INV + 0.5;

                if (u < 0.5) {
                    isFirstHalf = true;
                }

                uList[i] = u;
                triangle.vertexData[offset + 7] = 1 - (Math.atan2(Math.sqrt(dx * dx + dz * dz), dy) * TAU_INV - 0.25);
            }

            // correctly handle wrap-around point
            for (let offset = 6, i = 0; offset < 24; offset += 8, i++) {
                let u = uList[i];
                if (isFirstHalf && u > 0.75) {
                    u -= 1;
                }

                triangle.vertexData[offset] = u;
            }
        }
    }

    private smoothenVertexNormal(hardNormals: Array<vec3>, surfaceAreas: Array<number>, dotThreshold: number, triangle: Triangle, vertexIdx: number) {
        // don't do anything if normal is already set
        if (triangle.hasNormals(vertexIdx)) {
            return;
        }

        // get vertex star
        const vertexStar = triangle.getVertexStar(vertexIdx);

        // group vertex star by angle (triangles with close normals are grouped
        // together)
        let groups = new Array<Array<[triangle: Triangle, vertexIndex: number]>>();

        for (const vsPair of vertexStar) {
            // check which groups this triangle belongs to
            const groupCount = groups.length;
            const otherTriangle = vsPair[0];
            const newNormal = hardNormals[otherTriangle.helper];
            const belongsTo = new Array<number>();

            for (let g = 0; g < groupCount; g++) {
                const group = groups[g];

                for (const [groupTri, _groupVertex] of group) {
                    if (vec3.dot(hardNormals[groupTri.helper], newNormal) > dotThreshold) {
                        belongsTo.push(g);
                        break;
                    }
                }
            }

            // if the triangle belongs to a single group, add it to the group.
            // if the triangle belongs to multiple groups, merge the groups and
            // add it to the merged group. if the triangle doesn't belong to any
            // group, make a new group
            switch (belongsTo.length) {
                case 0:
                    groups.push([vsPair]);
                    break;
                case 1:
                    groups[belongsTo[0]].push(vsPair);
                    break;
                default:
                {
                    const newGroups = new Array<Array<[triangle: Triangle, vertexIndex: number]>>();
                    const mergedGroup = new Array<[triangle: Triangle, vertexIndex: number]>();

                    for (const g of belongsTo) {
                        mergedGroup.push(...groups[g]);
                    }

                    for (let g = 0; g < groupCount; g++) {
                        if (!belongsTo.includes(g)) {
                            newGroups.push(groups[g]);
                        }
                    }

                    newGroups.push(mergedGroup);
                    groups = newGroups;
                }
            }
        }

        // calculate smooth normal of each group
        for (const group of groups) {
            const smoothNormal = vec3.create();

            for (const [otherTriangle, _otherVertex] of group) {
                // XXX weighted normals are used so that bevelled geometry isn't
                // ugly. note that normals are weighted by triangle surface area
                // but not by corner angle. this means that there are still
                // artifacts in low-poly cylinders. see:
                // http://www.bytehazard.com/articles/vertnorm.html
                const i = otherTriangle.helper;
                vec3.scaleAndAdd(smoothNormal, smoothNormal, hardNormals[i], surfaceAreas[i]);
            }

            vec3.normalize(smoothNormal, smoothNormal);

            for (const [otherTriangle, otherVertex] of group) {
                otherTriangle.setNormal(otherVertex, smoothNormal);
            }
        }
    }

    /**
     * Applies smooth normals to all vertices that have no normals set (0,0,0).
     * Smooth normals are calculated for each vertex by getting all triangles
     * connected to the vertex (the vertex star), and making smoothing groups
     * by checking the angle between all of those triangles. Triangles that have
     * similar angles will contribute to the average normal.
     *
     * @param maxAngle Maximum angle, in radians, between 2 triangles for them to be considered part of the same smoothing group for a vertex
     * @param resetNormals If true, then all vertex normals will be reset to (0,0,0) before applying the modifier
     */
    addSmoothNormals(maxAngle: number, resetNormals = true) {
        // convert angle to dot product threshold
        const dotThreshold = Math.cos(Math.max(Math.min(maxAngle, Math.PI), 0));

        // reset normals if needed
        if (resetNormals) {
            const zero = vec3.create();
            for (const triangle of this.triangles) {
                for (let e = 0; e < 3; e++) {
                    triangle.setNormal(e, zero);
                }
            }
        }

        // pre-calculate hard normals (used for averaging) and surface area
        const triCount = this.triangles.length;
        const hardNormals = new Array<vec3>(triCount);
        const surfaceAreas = new Array<number>(triCount);
        for (let t = 0; t < triCount; t++) {
            const tri = this.triangles[t];
            hardNormals[t] = tri.getFaceNormal();
            surfaceAreas[t] = tri.getSurfaceArea();
        }

        // set triangle helpers so that the triangles can be mapped to their
        // pre-calculated hard normals
        this.setTriangleHelpers();

        // smooth each vertex
        for (const triangle of this.triangles) {
            for (let v = 0; v < 3; v++) {
                this.smoothenVertexNormal(hardNormals, surfaceAreas, dotThreshold, triangle, v);
            }
        }
    }
}