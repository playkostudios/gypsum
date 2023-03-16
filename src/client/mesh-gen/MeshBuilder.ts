import { DynamicArray } from '../../common/DynamicArray';
import { BitArray } from './BitArray';
import { Triangle, VERTEX_STRIDE, VERTEX_TOTAL } from './Triangle';
import { vec2, vec3, mat4, mat3, vec4 } from 'gl-matrix';
import VertexHasher from './VertexHasher';
import { normalFromTriangle } from './normal-from-triangle';
import { makeIndexBuffer } from '../../common/makeIndexBuffer';
import { genInterlacedMergeMap, IndexRangeList } from './gen-interlaced-merge-map';
import { deinterlaceMergeMap } from './deinterlace-merge-map';
import { autoConnectAllEdges } from './auto-connect-all-edges';
import { Mesh, MeshAttribute } from '@wonderlandengine/api';
import { optimizeIndexData } from '../../common/optimize-index-data';
import { newShim_Mesh } from '../../common/backport-shim';
import { getHintAttributeFromSet } from './get-hint-attribute';

import type { Submesh } from '../MeshGroup';
import type { quat } from 'gl-matrix';
import type { MergeMap } from '../../common/MergeMap';
import type { EdgeList } from './EdgeList';
import type { Material } from '@wonderlandengine/api';
import type { WonderlandEngine } from '../../common/backport-shim';
import type { Hint } from '../../common/Hint';
import type { HintMap } from '../../common/HintMap';

const MAT3_IDENTITY = mat3.create();
const MAT4_IDENTITY = mat4.create();
const TAU_INV = 1 / (Math.PI * 2);
const DEFAULT_HINT: Hint = new Set([MeshAttribute.Tangent, MeshAttribute.Normal, MeshAttribute.TextureCoordinate, MeshAttribute.Color]);

function getVertexMid(a: Float32Array, b: Float32Array): Float32Array {
    const result = new Float32Array(VERTEX_STRIDE);

    // get average of each vertex attribute
    for (let i = 0; i < VERTEX_STRIDE; i++) {
        result[i] = (a[i] + b[i]) * 0.5;
    }

    // normalize normals and tangents
    const nx = result[3];
    const ny = result[4];
    const nz = result[5];
    const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (nLen > 0) {
        result[3] = nx * nLen;
        result[4] = ny * nLen;
        result[5] = nz * nLen;
    }

    // XXX only first 3 components are normalized
    // TODO check if this is right
    const tx = result[8];
    const ty = result[9];
    const tz = result[10];
    const tLen = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (tLen > 0) {
        const tDiv = 1 / tLen;
        result[8] = tx * tDiv;
        result[9] = ty * tDiv;
        result[10] = tz * tDiv;
    }

    return result;
}

function sortMaterials(materials: Iterable<Material | null>, materialMap: Map<number, Material | null>): Array<Material | null> {
    // reverse the material map (map materials to material IDs)
    const revMaterialMap = new Map<Material | null, number>();
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

/**
 * Extra mesh attributes to pass to {@link MeshBuilder#addTriangle}, but without
 * normals.
 */
export interface ExtraTriangleAttributesNoNormals {
    uvs?: [uv0: Readonly<vec2>, uv1: Readonly<vec2>, uv2: Readonly<vec2>],
    tangents?: [tangent0: Readonly<vec4>, tangent1: Readonly<vec4>, tangent2: Readonly<vec4>],
    colors?: [color0: Readonly<vec4>, color1: Readonly<vec4>, color2: Readonly<vec4>],
}

/** Extra mesh attributes to pass to {@link MeshBuilder#addTriangle}. */
export interface ExtraTriangleAttributes extends ExtraTriangleAttributesNoNormals {
    normals?: [normal0: Readonly<vec3>, normal1: Readonly<vec3>, normal2: Readonly<vec3>],
}

// XXX this whole class could be optimised by having a
// WL.Mesh.isAttributeAvailable API, and a pipeline API, so that we could choose
// whether or not to generate normals and UVs, but there's nothing i can do
// about it for now (the isAttributeAvailable feature could be hacked in, but
// it's very ugly and i'd rather wait)

/** A helper class for easily creating meshes, with connected triangles. */
export class MeshBuilder {
    /**
     * The list of all triangles in this manifold. Note that this array might be
     * detached from the builder and replaced with a new array. It is safe to
     * use between operations, but when doing some operations such as
     * {@link MeshBuilder#subDivide4}, a new array will be created.
     */
    triangles = new Array<Triangle>();

    /** @param engine - The Wonderland Engine instance being used */
    constructor(readonly engine: WonderlandEngine) {}

    /**
     * Get the number of triangles in this MeshBuilder. Equivalent to getting
     * the length of {@link MeshBuilder#triangles}.
     */
    get numTri(): number {
        return this.triangles.length;
    }

    /** Disconnects all edges in each triangle of this manifold builder. */
    disconnectAllEdges(): void {
        for (const triangle of this.triangles) {
            let i = 0;
            while (i < 3) {
                triangle.disconnectEdge(i++);
            }
        }
    }

    /**
     * Calls {@link MeshBuilder#autoConnectAllEdges} with all the triangles in
     * this builder.
     */
    autoConnectAllEdges(): void {
        autoConnectAllEdges(this.triangles);
    }

    /**
     * Similar to {@link MeshBuilder#addTriangle}, but normals are not set
     * (kept as 0,0,0).
     *
     * @param extraAttributes: Extra mesh attributes to add to the triangle, but normals are ignored
     */
    addTriangleNoNormals(pos0: Readonly<vec3>, pos1: Readonly<vec3>, pos2: Readonly<vec3>, extraAttributes?: ExtraTriangleAttributesNoNormals): Triangle {
        const triangle = new Triangle();
        triangle.setPositions(pos0, pos1, pos2);

        if (extraAttributes) {
            if (extraAttributes.uvs) {
                triangle.setUVs(extraAttributes.uvs[0], extraAttributes.uvs[1], extraAttributes.uvs[2]);
            }

            if (extraAttributes.tangents) {
                triangle.setTangents(extraAttributes.tangents[0], extraAttributes.tangents[1], extraAttributes.tangents[2]);
            }

            if (extraAttributes.colors) {
                triangle.setColors(extraAttributes.colors[0], extraAttributes.colors[1], extraAttributes.colors[2]);
            }
        }

        triangle.helper = this.numTri;
        this.triangles.push(triangle);
        return triangle;
    }

    /**
     * Pushes a new triangle to the end of the {@link MeshBuilder#triangles}
     * array. Helpers are set to their index on the triangles array.
     *
     * @param extraAttributes: Extra mesh attributes to add to the triangle
     */
    addTriangle(pos0: Readonly<vec3>, pos1: Readonly<vec3>, pos2: Readonly<vec3>, extraAttributes?: ExtraTriangleAttributes): Triangle {
        const triangle = this.addTriangleNoNormals(pos0, pos1, pos2, extraAttributes);

        if (extraAttributes && extraAttributes.normals) {
            triangle.setNormals(extraAttributes.normals[0], extraAttributes.normals[1], extraAttributes.normals[2]);
        } else {
            const temp = normalFromTriangle(pos0, pos1, pos2);
            triangle.setNormals(temp, temp, temp);
        }

        return triangle;
    }

    /**
     * Add triangles that make up a sub-divided quad. Adding a quad with 1
     * sub-division will create 2 new triangles, while adding a quad with 2
     * sub-divisions will create 8 triangles (4 sub-quads, with 2 triangles
     * each).
     *
     * All edges in generated triangles will be connected, except the border
     * edges; new triangles will not be connected to triangles already present
     * in the builder.
     *
     * @param tlPos - Top-left quad position.
     * @param trPos - Top-right quad position.
     * @param blPos - Bottom-left quad position.
     * @param brPos - Bottom-right quad position.
     * @param materialID - The material to use for the quad, as a numeric ID.
     * @param addTangents - True by default. If true, then vertex tangents will be generated for each triangle. Tangents point from left to right, and have a w component of 1.
     * @param subDivisions - The amount of horizontal and vertical subdivisions to use. 1 by default (only one square). If there are 2 sub-divisions there will be 4 squares, 3 sub-divisions there will be 9 squares, etc...
     * @param tlUV - Top-left quad texture coordinate.
     * @param trUV - Top-right quad texture coordinate.
     * @param blUV - Bottom-left quad texture coordinate.
     * @param brUV - Bottom-right quad texture coordinate.
     */
    addSubdivQuad(tlPos: vec3, trPos: vec3, blPos: vec3, brPos: vec3, materialID: number, addTangents = true, subDivisions = 1, tlUV?: vec2, trUV?: vec2, blUV?: vec2, brUV?: vec2): void {
        const subDivisionsP1 = subDivisions + 1;
        const pointCount = subDivisionsP1 * subDivisionsP1;
        const triStride = subDivisions * 2;

        // pre-calculate all positions (and uvs)
        const positions = new Array<vec3>(pointCount);
        let uvs: null | Array<vec2> = null;

        if (tlUV) {
            // assume other uv coordinates are supplied
            uvs = new Array<vec2>(pointCount);
        }

        for (let j = 0; j <= subDivisions; j++) {
            // j goes from top to bottom
            const j0 = (subDivisions - j) / subDivisions;
            const j1 = j / subDivisions;
            const jOffset = subDivisionsP1 * j;

            for (let i = 0; i <= subDivisions; i++) {
                // i goes from left to right
                const i0 = (subDivisions - i) / subDivisions;
                const i1 = i / subDivisions;

                // do bilinear interpolation for position
                const pos = vec3.scale(vec3.create(), tlPos, i0 * j0);
                vec3.scaleAndAdd(pos, pos, trPos, i1 * j0);
                vec3.scaleAndAdd(pos, pos, blPos, i0 * j1);
                vec3.scaleAndAdd(pos, pos, brPos, i1 * j1);
                positions[jOffset + i] = pos;

                if (uvs) {
                    // do bilinear interpolation for uvs
                    const uv = vec2.scale(vec2.create(), tlUV as vec2, i0 * j0);
                    vec2.scaleAndAdd(uv, uv, trUV as vec2, i1 * j0);
                    vec2.scaleAndAdd(uv, uv, blUV as vec2, i0 * j1);
                    vec2.scaleAndAdd(uv, uv, brUV as vec2, i1 * j1);
                    uvs[jOffset + i] = uv;
                }
            }
        }

        // pre-calculate quad normal and tangents
        const normal = normalFromTriangle(tlPos, blPos, trPos, vec3.create());
        let isParallelogram = false; // only used for tangents
        let tangents: vec4 | Array<vec4> | null = null;

        if (addTangents) {
            // if this is a parallelogram, then all points have the same
            // tangent. check if this is a parallelogram.
            // check left->right lines
            const lrTop = vec3.sub(vec3.create(), trPos, tlPos);
            const lrBot = vec3.sub(vec3.create(), brPos, blPos);
            if (vec3.equals(lrTop, lrBot)) {
                isParallelogram = true;
            }

            vec3.normalize(lrTop, lrTop);
            if (isParallelogram) {
                // quad is a parallelogram, so tangents are equal
                tangents = vec4.fromValues(lrTop[0], lrTop[1], lrTop[2], 1);
            } else {
                // quad is not a parallelogram, so most tangents are different.
                // specifically, each "height" (vertical segment) has a
                // different tangent
                tangents = new Array(subDivisionsP1);
                vec3.normalize(lrBot, lrBot);
                const tmp = vec3.create();

                for (let j = 0; j <= subDivisions; j++) {
                    // lerp top and bottom tangent
                    vec3.lerp(tmp, lrTop, lrBot, j / subDivisions);
                    tangents[j] = vec4.fromValues(tmp[0], tmp[1], tmp[2], 1);
                }
            }

        }

        // make triangles
        const startIdx = this.numTri;
        for (let j = 0, jOffset = 0; j < subDivisions; j++, jOffset += subDivisionsP1) {
            for (let i = 0; i < subDivisions; i++) {
                const o00 = jOffset + i;
                const o10 = o00 + 1;
                const o01 = o00 + subDivisionsP1;
                const o11 = o01 + 1;

                const tlTri = this.addTriangle(positions[o00], positions[o01], positions[o10]);
                tlTri.setNormals(normal, normal, normal);
                const brTri = this.addTriangle(positions[o10], positions[o01], positions[o11]);
                brTri.setNormals(normal, normal, normal);
                tlTri.materialID = materialID;
                brTri.materialID = materialID;

                if (uvs) {
                    tlTri.setUV(0, uvs[o00]);
                    tlTri.setUV(1, uvs[o01]);
                    tlTri.setUV(2, uvs[o10]);
                    brTri.setUV(0, uvs[o10]);
                    brTri.setUV(1, uvs[o01]);
                    brTri.setUV(2, uvs[o11]);
                }

                if (addTangents) {
                    if (isParallelogram) {
                        tlTri.setTangent(0, tangents as vec4);
                        tlTri.setTangent(1, tangents as vec4);
                        tlTri.setTangent(2, tangents as vec4);
                        brTri.setTangent(0, tangents as vec4);
                        brTri.setTangent(1, tangents as vec4);
                        brTri.setTangent(2, tangents as vec4);
                    } else {
                        const tangent = (tangents as Array<vec4>)[j];
                        tlTri.setTangent(0, tangent);
                        tlTri.setTangent(1, tangent);
                        tlTri.setTangent(2, tangent);
                        brTri.setTangent(0, tangent);
                        brTri.setTangent(1, tangent);
                        brTri.setTangent(2, tangent);
                    }
                }

                // connect both triangles
                tlTri.connectEdge(1, 0, brTri);
            }
        }

        // connect triangles between subdivision lines
        const subDivisionsM1 = subDivisions - 1;
        for (let j = 0, jOffset = startIdx; j < subDivisions; j++) {
            for (let i = 0; i < subDivisions; i++, jOffset += 2) {
                const tlOffset = jOffset;
                const brOffset = tlOffset + 1;
                const brTri = this.triangles[brOffset];

                if (j < subDivisionsM1) {
                    // not last sub-division, can connect vertically
                    brTri.connectEdge(1, 2, this.triangles[tlOffset + triStride]);
                }

                if (i < subDivisionsM1) {
                    // not last sub-division, can connect horizontally
                    brTri.connectEdge(2, 0, this.triangles[brOffset + 1]);
                }
            }
        }
    }

    /**
     * Similar to {@link addSubdivQuad}, but also records edges and triangles to
     * given lists so that they can be used with {@link autoConnectEdges}.
     *
     * @param edgeList - The list of edges that will be connected to the list of triangles. Edges will be appended to this list if the edgeMask is set to a non-zero value.
     * @param connectableTriangles - The list of triangles that will be connected to the list of edges. Triangles will be appended to this list if the connectableTriMask is set to a non-zero value.
     * @param edgeMask - A 4-bit bitmask with the edges that will be added to the list of edges. The bits, from most significant to least significant, are: left edge, right edge, top edge, bottom edge.
     * @param connectableTriMask - A 4-bit bitmask with the triangles that will be added to the list of connectable triangles. The bits, from most significant to least significant, are: left edge triangles, right edge triangles, top edge triangles, bottom edge triangles.
     * @param tlPos - Top-left quad position.
     * @param trPos - Top-right quad position.
     * @param blPos - Bottom-left quad position.
     * @param brPos - Bottom-right quad position.
     * @param materialID - The material to use for the quad, as a numeric ID.
     * @param addTangents True by default. If true, then vertex tangents will be generated for each triangle. Tangents point from left to right, and have a w component of 1.
     * @param tlUV - Top-left quad texture coordinate.
     * @param trUV - Top-right quad texture coordinate.
     * @param blUV - Bottom-left quad texture coordinate.
     * @param brUV - Bottom-right quad texture coordinate.
     */
    addSubdivQuadWithEdges(edgeList: EdgeList, connectableTriangles: Array<Triangle>, edgeMask: number, connectableTriMask: number, tlPos: vec3, trPos: vec3, blPos: vec3, brPos: vec3, materialID: number, addTangents = true, subDivisions = 1, tlUV?: vec2, trUV?: vec2, blUV?: vec2, brUV?: vec2): void {
        if ((edgeMask & connectableTriMask) > 0) {
            console.warn('edgeMask and connectableTriMask have bits set in both masks. Lists generated will not be usable by autoConnectEdges, unless both lists are used in different calls');
        }

        // make quad
        const triOffset = this.numTri;
        this.addSubdivQuad(tlPos, trPos, blPos, brPos, materialID, addTangents, subDivisions, tlUV, trUV, blUV, brUV);

        // append to lists
        const triStride = subDivisions * 2;
        const triCount = triStride * subDivisions;
        // XXX helper variables for left, right, top and bottom edges logic.
        // contains the bit to compare for each bitmask, the edge index, the
        // triangle index increment for each iteration, the loop start value,
        // and the loop end value
        const rTriOffset = triOffset + triStride - 1;
        const bTriOffset = triOffset + triStride * (subDivisions - 1) + 1;
        const helpers: Array<[bitmaskMask: number, edgeIdx: number, triInc: number, triStart: number, triEnd: number]> = [
            [ 0b1000, 0, triStride, triOffset, triOffset + triCount ],
            [ 0b0100, 2, triStride, rTriOffset, rTriOffset + triCount ],
            [ 0b0010, 2, 2, triOffset, triOffset + triStride ],
            [ 0b0001, 1, 2, bTriOffset, bTriOffset + triStride ],
        ];

        for (const [bitmaskMask, edgeIdx, triInc, triStart, triEnd] of helpers) {
            const needsEdge = (edgeMask & bitmaskMask) > 0;
            const needsTri = (connectableTriMask & bitmaskMask) > 0;
            if (needsEdge || needsTri) {
                for (let i = triStart; i < triEnd; i += triInc) {
                    const tri = this.triangles[i];
                    if (needsEdge) {
                        edgeList.push([tri, edgeIdx]);
                    }
                    if (needsTri) {
                        connectableTriangles.push(tri);
                    }
                }
            }
        }
    }

    /**
     * Sub-divide each triangle in the MeshBuilder into 4 triangles, where the
     * midpoints of each edge are used as the corners of the new triangles.
     * Replaces {@link MeshBuilder#triangles} with a new array instead of
     * modifying it in-place.
     */
    subDivide4(): void {
        // split triangle into 4, in the same order as the original array.
        // triangles:
        // 0: top triangle (0, 0-1 mid, 2-0 mid)
        // 1: bottom left triangle (0-1 mid, 1, 1-2 mid)
        // 2: bottom right triangle (2-0 mid, 1-2 mid, 2)
        // 3: middle triangle (1-2 mid, 2-0 mid, 0-1 mid)
        const triCount = this.numTri;
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

            // set helpers and save triangles
            tTri.helper = i;
            newTriangles[i++] = tTri;
            blTri.helper = i;
            newTriangles[i++] = blTri;
            brTri.helper = i;
            newTriangles[i++] = brTri;
            mTri.helper = i;
            newTriangles[i++] = mTri;
        }

        // connect triangles according to original shared edges
        // XXX there are a lot of redundant operations, but i feel like trying
        // to reduce them would be more expensive than keeping it as is
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

    /**
     * Normalizes each triangle in the MeshBuilder, effectively turning the mesh
     * into a sphere.
     */
    normalize(): void {
        for (const triangle of this.triangles) {
            triangle.normalize();
        }
    }

    /** Internal function. Creates a submesh */
    private finalizeSubmesh(material: Material | null, hint: Hint, failOnMissing: boolean, triangles: Array<Triangle>, timOffset: number, triIdxMap: Uint32Array | null, totalVertexCount: number, indexRangeList: IndexRangeList): [submesh: Submesh, totalVertexCount: number] {
        // make index and vertex data in advance
        const triCount = triangles.length;
        // XXX this assumes the worst case; that no vertices are merged. index
        //     buffer is optimized later
        const indexCount = triCount * 3;
        let [indexData, indexType] = makeIndexBuffer(indexCount, indexCount);
        const positions = new DynamicArray(Float32Array);
        const normals = hint.has(MeshAttribute.Normal) ? new DynamicArray(Float32Array) : null;
        const texCoords = hint.has(MeshAttribute.TextureCoordinate) ? new DynamicArray(Float32Array) : null;
        const tangents = hint.has(MeshAttribute.Tangent) ? new DynamicArray(Float32Array) : null;
        const colors = hint.has(MeshAttribute.Color) ? new DynamicArray(Float32Array) : null;

        const hasher = new VertexHasher(VERTEX_STRIDE);
        let nextIdx = 0;

        for (let t = 0, iOffset = 0; t < triCount; t++) {
            const triangle = triangles[t];

            if (triIdxMap) {
                triIdxMap[triangle.helper] = iOffset + timOffset;
            }

            for (let i = 0, offset = 0; i < 3; i++, offset += VERTEX_STRIDE) {
                const auxIdx = hasher.getAuxIdx(triangle.vertexData, nextIdx, offset);
                if (auxIdx === null) {
                    const posBufLen = positions.length;
                    positions.length = posBufLen + 3;
                    positions.copy(posBufLen, triangle.getPosition(i));

                    if (normals) {
                        const normBufLen = normals.length;
                        normals.length = normBufLen + 3;
                        normals.copy(normBufLen, triangle.getNormal(i));
                    }

                    if (texCoords) {
                        const uvBufLen = texCoords.length;
                        texCoords.length = uvBufLen + 2;
                        texCoords.copy(uvBufLen, triangle.getUV(i));
                    }

                    if (tangents) {
                        const tanBufLen = tangents.length;
                        tangents.length = tanBufLen + 4;
                        tangents.copy(tanBufLen, triangle.getTangent(i));
                    }

                    if (colors) {
                        const colBufLen = colors.length;
                        colors.length = colBufLen + 4;
                        colors.copy(colBufLen, triangle.getColor(i));
                    }

                    indexData[iOffset++] = nextIdx++;
                } else {
                    indexData[iOffset++] = auxIdx;
                }
            }
        }

        // optimise index buffer
        const vertexCount = positions.length / 3;
        [indexData, indexType] = optimizeIndexData(indexData, indexType, indexCount, vertexCount);

        // add to index range list
        let indexStart = 0;
        if (indexRangeList.length > 0) {
            indexStart = indexRangeList[indexRangeList.length - 1][2];
        }

        indexRangeList.push([totalVertexCount, indexStart, indexStart + indexData.length, indexData]);

        // instance one mesh
        totalVertexCount += vertexCount;
        const mesh = newShim_Mesh(this.engine, { vertexCount, indexData, indexType });

        try {
            // upload vertex data
            const positionsAttr = mesh.attribute(MeshAttribute.Position);
            if (!positionsAttr) {
                throw new Error('Could not get position mesh attribute accessor');
            }
            positionsAttr.set(0, positions.finalize());

            const normalsAttr = getHintAttributeFromSet(mesh, hint, MeshAttribute.Normal, failOnMissing);
            if (normalsAttr) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                normalsAttr.set(0, normals!.finalize());
            }

            const texCoordsAttr = getHintAttributeFromSet(mesh, hint, MeshAttribute.TextureCoordinate, failOnMissing);
            if (texCoordsAttr) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                texCoordsAttr.set(0, texCoords!.finalize());
            }

            const tangentsAttr = getHintAttributeFromSet(mesh, hint, MeshAttribute.Tangent, failOnMissing);
            if (tangentsAttr) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                tangentsAttr.set(0, tangents!.finalize());
            }

            const colorsAttr = getHintAttributeFromSet(mesh, hint, MeshAttribute.Color, failOnMissing);
            if (colorsAttr) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                colorsAttr.set(0, colors!.finalize());
            }
        } catch(e) {
            mesh.destroy();
            throw e;
        }

        return [[mesh, material], totalVertexCount];
    }

    /**
     * Check if all triangles in the MeshBuilder are connected to each-other.
     *
     * @return True if all triangles are connected.
     */
    get isConnected(): boolean {
        const visited = new BitArray(this.numTri);
        const queue: Array<number> = [0];
        while (queue.length > 0) {
            const next = queue.pop() as number;

            if (visited.getAndSet(next, true)) {
                continue;
            }

            const nextTri = this.triangles[next];

            const otherA = nextTri.getConnectedEdge(0);
            if (otherA) {
                queue.push(otherA[1].helper);
            }

            const otherB = nextTri.getConnectedEdge(1);
            if (otherB) {
                queue.push(otherB[1].helper);
            }

            const otherC = nextTri.getConnectedEdge(2);
            if (otherC) {
                queue.push(otherC[1].helper);
            }
        }

        return visited.isAllSet();
    }

    /**
     * Create a list of Wonderland Engine meshes and a manifold from the current
     * list of triangles. Helpers are expected to be set. If not, make sure to
     * call {@link MeshBuilder#setTriangleHelpers}.
     *
     * Output meshes are optimised by merging vertices with the same vertex
     * data, via indexing.
     *
     * @param materialMap - Maps each material index to a Wonderland Engine material. Triangles with different material will be put in separate meshes, but in the same manifold. A null material is equivalent to the material being missing in the material map. Materials missing from the material map will use null as the material so they can be replaced later with a fallback material.
     * @param hints - Maps a hint to a material. The null key represents the default hint. A hint decides which mesh attribute to generate.
     * @param generateManifold - True by default. If true, a manifold and a submesh map will also be generated, otherwise, these will be null. Note than if a manifold is generated, then the triangles must form a 2-manifold surface, but if a manifold is not generated, then even a triangle soup is supported.
     */
    finalize(materialMap: Map<number, Material | null>, hints: HintMap, generateManifold?: true): [ submeshes: Array<Submesh>, mergeMap: MergeMap ];
    finalize(materialMap: Map<number, Material | null>, hints: HintMap, generateManifold: false): [ submeshes: Array<Submesh>, mergeMap: null ];
    finalize(materialMap: Map<number, Material | null>, hints: HintMap, generateManifold = true): [ submeshes: Array<Submesh>, mergeMap: MergeMap | null ] {
        const triCount = this.triangles.length;
        const submeshes = new Array<Submesh>();
        const interlacedMergeMap = generateManifold ? new DynamicArray(Uint32Array) : null;

        // get default hint
        let defaultHintCrashes = false;
        let defaultHint: Hint;

        if (hints.has(null)) {
            defaultHintCrashes = true;
            defaultHint = hints.get(null) as Hint;
        } else {
            defaultHint = DEFAULT_HINT;
        }

        // create submeshes (and merge map if wanted)
        try {
            // group all triangles together by their materials
            const groupedTris = new Map<Material | null, Array<Triangle>>();

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

            // generate submeshes from triangle groups, and map triangles to
            // submesh indices
            const maybeTriIdxMap = interlacedMergeMap ? new Uint32Array(triCount) : null;
            const indexRangeList: IndexRangeList = [];
            let timOffset = 0, vertexCount = 0;

            for (const material of sortedMaterials) {
                // get hint for this material
                let hintCrashes = true;
                let hint: Hint | undefined = hints.get(material);

                if (hint === undefined) {
                    hintCrashes = defaultHintCrashes;
                    hint = defaultHint;
                }

                // finalize submesh
                const triangles = groupedTris.get(material) as Array<Triangle>;
                let submesh: Submesh;
                [submesh, vertexCount] = this.finalizeSubmesh(material, hint, hintCrashes, triangles, timOffset, maybeTriIdxMap, vertexCount, indexRangeList);
                submeshes.push(submesh);

                // XXX we know that the mesh has non-null indices... because we
                // made that mesh. there is no type information to convey this
                // unfortunately
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                timOffset += submesh[0].indexData!.length;
            }

            // merge vertices in the same vertex star (generate merge map)
            if (interlacedMergeMap) {
                genInterlacedMergeMap(this.triangles, vertexCount, indexRangeList, maybeTriIdxMap as Uint32Array, interlacedMergeMap);
            }
        } catch(e) {
            // free up meshes
            for (const [mesh, _material] of submeshes) {
                mesh.destroy();
            }

            throw e;
        }

        // de-interlace merge map into format wanted by Manifold
        if (interlacedMergeMap) {
            return [submeshes, deinterlaceMergeMap(interlacedMergeMap)];
        } else {
            return [submeshes, null];
        }
    }

    /**
     * Translate each triangle in the MeshBuilder by a given offset.
     *
     * @param offset - The offset to translate by.
     */
    translate(offset: vec3): void {
        if (offset[0] === 0 && offset[1] === 0 && offset[2] === 0) {
            return;
        }

        for (const triangle of this.triangles) {
            triangle.translate(offset);
        }
    }

    /**
     * Scale each triangle in the MeshBuilder by a given factor.
     *
     * @param factor - The factor to scale by.
     */
    scale(factor: vec3): void {
        if (factor[0] === 1 && factor[1] === 1 && factor[2] === 1) {
            return;
        }

        for (const triangle of this.triangles) {
            triangle.scale(factor);
        }
    }

    /**
     * Uniformly scale each triangle in the MeshBuilder by a given factor.
     *
     * @param factor - The factor to scale by.
     */
    uniformScale(factor: number): void {
        if (factor === 1) {
            return;
        }

        for (const triangle of this.triangles) {
            triangle.uniformScale(factor);
        }
    }

    /**
     * Rotate each triangle in the MeshBuilder by a given rotation.
     *
     * @param rotation - The quaternion to rotate by.
     * @param rotateNormal - Should the normals of each triangle be rotated? Defaults to true.
     * @param rotateTangent - Should the tangents of each triangle be rotated? Defaults to true.
     */
    rotate(rotation: quat, rotateNormal = true, rotateTangent = true): void {
        if (rotation[0] === 0 && rotation[1] === 0 && rotation[2] === 0 && rotation[3] === 1) {
            return;
        }

        for (const triangle of this.triangles) {
            triangle.rotate(rotation, rotateNormal, rotateTangent);
        }
    }

    /**
     * Transform each triangle in the MeshBuilder by a given transformation
     * matrix.
     *
     * @param matrix - The transformation matrix to transform positions by.
     * @param normalMatrix - The transformation matrix to transform normals and tangents by. Will be ignored if normals and tangents aren't transformed. If not supplied and normals or tangents are to be transformed, then it will be automatically created from the position transform matrix.
     * @param transformNormal - Should the normals of each triangle be transformed? Defaults to true.
     * @param transformTangent - Should the tangents of each triangle be transformed? Defaults to true.
     */
    transform(matrix: mat4, normalMatrix?: mat3, transformNormal = true, transformTangent = true): void {
        if (mat4.exactEquals(matrix, MAT4_IDENTITY) && (!normalMatrix || mat3.exactEquals(normalMatrix, MAT3_IDENTITY))) {
            return;
        }

        if (!normalMatrix && (transformNormal || transformTangent)) {
            normalMatrix = mat3.fromMat4(mat3.create(), matrix);
        }

        for (const triangle of this.triangles) {
            triangle.transform(matrix, normalMatrix, transformNormal, transformTangent);
        }
    }

    /**
     * Map triangles back to their indices in the triangles array by setting the
     * helper variable of each triangle.
     */
    setTriangleHelpers(): void {
        const triCount = this.numTri;
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
            for (let offset = 0, i = 0; offset < VERTEX_TOTAL; offset += VERTEX_STRIDE, i++) {
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
            for (let offset = 6, i = 0; offset < VERTEX_TOTAL; offset += VERTEX_STRIDE, i++) {
                let u = uList[i];
                if (isFirstHalf && u > 0.75) {
                    u -= 1;
                }

                triangle.vertexData[offset] = u;
            }
        }
    }

    /** Internal method. Makes smooth vertex normals given helper values. */
    private smoothenVertexNormal(hardNormals: Array<vec3>, surfaceAreas: Array<number>, dotThreshold: number, triangle: Triangle, vertexIdx: number, mergeTangents: boolean) {
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
        const smoothNormal = vec3.create(), smoothTangent: null | vec4 = mergeTangents ? vec4.create() : null;
        for (const group of groups) {
            vec3.zero(smoothNormal);

            if (smoothTangent) {
                vec4.zero(smoothTangent);
            }

            for (const [otherTriangle, otherVertex] of group) {
                // XXX weighted normals are used so that bevelled geometry isn't
                // ugly. note that normals are weighted by triangle surface area
                // but not by corner angle. this means that there are still
                // artifacts in low-poly cylinders. see:
                // http://www.bytehazard.com/articles/vertnorm.html
                const i = otherTriangle.helper;
                vec3.scaleAndAdd(smoothNormal, smoothNormal, hardNormals[i], surfaceAreas[i]);

                if (smoothTangent) {
                    vec4.scaleAndAdd(smoothTangent, smoothTangent, otherTriangle.getTangent(otherVertex), surfaceAreas[i])
                }
            }

            vec3.normalize(smoothNormal, smoothNormal);

            if (smoothTangent) {
                vec3.normalize(smoothTangent as vec3, smoothTangent as vec3);

                if (smoothTangent[3] >= 0) {
                    smoothTangent[3] = 1;
                } else {
                    smoothTangent[3] = -1;
                }
            }

            for (const [otherTriangle, otherVertex] of group) {
                otherTriangle.setNormal(otherVertex, smoothNormal);

                if (smoothTangent) {
                    otherTriangle.setTangent(otherVertex, smoothTangent);
                }
            }
        }
    }

    /**
     * Applies smooth normals to all vertices that have no normals set (0,0,0).
     * Smooth normals are calculated for each vertex by getting all triangles
     * connected to the vertex (the vertex star), and making smoothing groups
     * by checking the angle between all of those triangles. Triangles that have
     * similar angles will contribute to the average normal. Triangles are
     * expected to have their helpers set. If not, make sure to call
     * {@link MeshBuilder#setTriangleHelpers} (note that
     * {@link MeshBuilder#addTriangle} already does this).
     *
     * @param maxAngle - Maximum angle, in radians, between 2 triangles for them to be considered part of the same smoothing group for a vertex
     * @param resetNormals - If true, then all vertex normals will be reset to (0,0,0) before applying the modifier
     * @param mergeTangents - Defaults to true. If true, then smoothed vertices will have their tangents merged.
     */
    addSmoothNormals(maxAngle: number, resetNormals = true, mergeTangents = true) {
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
        const triCount = this.numTri;
        const hardNormals = new Array<vec3>(triCount);
        const surfaceAreas = new Array<number>(triCount);
        for (let t = 0; t < triCount; t++) {
            const tri = this.triangles[t];
            hardNormals[t] = tri.getFaceNormal();
            surfaceAreas[t] = tri.getSurfaceArea();
        }

        // smooth each vertex
        for (const triangle of this.triangles) {
            for (let v = 0; v < 3; v++) {
                this.smoothenVertexNormal(hardNormals, surfaceAreas, dotThreshold, triangle, v, mergeTangents);
            }
        }
    }

    /**
     * Modify all positions on the mesh by a given function. Other vertex
     * attributes are not modified.
     *
     * @param transformer - The transformation function to use for warping each vertex. Should return a new position given an X, Y and Z component of the original triangle.
     */
    warpPositions(transformer: (x: number, y: number, z: number) => vec3): void {
        for (const triangle of this.triangles) {
            for (let vo = 0; vo < VERTEX_TOTAL; vo += VERTEX_STRIDE) {
                const newPos = transformer(
                    triangle.vertexData[vo], triangle.vertexData[vo + 1],
                    triangle.vertexData[vo + 2]
                );

                triangle.vertexData[vo] = newPos[0];
                triangle.vertexData[vo + 1] = newPos[1];
                triangle.vertexData[vo + 2] = newPos[2];
            }
        }
    }
}