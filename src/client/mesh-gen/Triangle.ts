import { vec3, vec4, mat4, quat, mat3 } from 'gl-matrix';
import { normalFromTriangle } from './normal-from-triangle';
import { Tuple } from '../misc/Tuple';
import { NumRange } from '../misc/NumRange';
import { EPS } from '../misc/EPS';

import type { vec2 } from 'gl-matrix';

const THIRD = 1 / 3;
const tmp0 = vec3.create();
const tmp1 = vec3.create();
export const VERTEX_STRIDE = 12;
export const VERTEX_TOTAL = VERTEX_STRIDE * 3;
export const VERTEX_1 = VERTEX_STRIDE;
export const VERTEX_2 = VERTEX_STRIDE * 2;

function validateEdgeIndex(edgeIndex: number) {
    if ([0, 1, 2].indexOf(edgeIndex) === -1) {
        throw new Error(`Invalid edge index (${edgeIndex})`);
    }
}

export type VertexStar = Array<[triangle: Triangle, vertexIndex: number]>;

/**
 * An easy-to-use triangle representation. Memory efficient per triangle, but
 * not per whole mesh, as it does not share vertex data with other triangles.
 * Represents a manifold by providing which triangle an edge is connected to.
 * Winding order is counter-clockwise.
 *
 * ```
 *           0
 *   edge 0 / \ edge 2
 *    (AB) /   \ (CA)
 *        1-----2
 *        edge 1
 *         (BC)
 * ```
 */
export class Triangle {
    /**
     * Generic data of this triangle, packed in a single integer.
     *
     * Bits 0-5:
     *   Which edge of another triangle is each respective edge connected to?
     *   - bits 0-1: edge index of other triangle for this triangle's edge 0
     *   - bits 2-3: edge index of other triangle for this triangle's edge 1
     *   - bits 4-5: edge index of other triangle for this triangle's edge 2
     *
     *   Other triangle's edge index can be 0, 1 or 2. If 3, then the edge is
     *   not connected.
     *
     * Bits 6-31:
     *   25-bit material ID. Triangles with different material IDs will be put
     *   in different WL.Mesh instances, but the same manifold if they are
     *   connected.
     */
    private bitData = 0b111111;

    /** The triangle connected to edge 0 */
    private edgeTriangle0: Triangle | null = null;
    /** The triangle connected to edge 1 */
    private edgeTriangle1: Triangle | null = null;
    /** The triangle connected to edge 2 */
    private edgeTriangle2: Triangle | null = null;

    /**
     * The positions, normals and UVs of each triangle. Even though normals and
     * UVs are optional, space will still be reserved for them.
     *
     * The format is interleaved:
     * - float 0-2: vertex 0's position
     * - float 3-5: vertex 0's normal
     * - float 6-7: vertex 0's UV (unused if no uvs)
     * - float 8-11: vertex 0's tangent (unused if no tangents)
     * - float 12-15: vertex 1's position
     * - float 16-18: vertex 1's normal
     * - float 19-20: vertex 1's UV
     * - float 21-24: vertex 1's tangent
     * - float 25-27: vertex 2's position
     * - float 28-30: vertex 2's normal
     * - float 31-32: vertex 2's UV
     * - float 33-36: vertex 2's tangent
     */
    readonly vertexData: Float32Array;

    /**
     * A generic helper variable intended to be used as an index.
     */
    helper = 0;

    constructor(vertexData?: Float32Array) {
        if (vertexData) {
            this.vertexData = vertexData;
        } else {
            this.vertexData = new Float32Array(VERTEX_TOTAL);
        }
    }

    static fromVertices(vert0: Float32Array, vert1: Float32Array, vert2: Float32Array): Triangle {
        const vertexData = new Float32Array(VERTEX_TOTAL);
        vertexData.set(vert0);
        vertexData.set(vert1, VERTEX_1);
        vertexData.set(vert2, VERTEX_2);
        return new Triangle(vertexData);
    }

    private setEdgeTriangle(edgeIndex: number, triangle: Triangle | null) {
        switch(edgeIndex) {
            case 0:
                this.edgeTriangle0 = triangle;
                break;
            case 1:
                this.edgeTriangle1 = triangle;
                break;
            case 2:
                this.edgeTriangle2 = triangle;
                break;
            default:
                throw new Error(`Invalid edge index (${edgeIndex})`);
        }
    }

    get materialID(): number {
        return this.bitData >>> 6;
    }

    set materialID(newMaterialID: number) {
        // clear material ID bits
        this.bitData &= 0b111111;
        // set new material ID
        this.bitData |= newMaterialID << 6;
    }

    isEdgeConnected(edgeIndex: number): boolean {
        return ((this.bitData >>> (edgeIndex << 1)) & 0b11) !== 3;
    }

    getConnectedEdge(edgeIndex: number): [number, Triangle] | null {
        validateEdgeIndex(edgeIndex);

        const otherEdge = (this.bitData >>> (edgeIndex << 1)) & 0b11;
        if (otherEdge === 3) {
            return null;
        }

        switch(edgeIndex) {
            case 0:
                return [otherEdge, this.edgeTriangle0 as Triangle];
            case 1:
                return [otherEdge, this.edgeTriangle1 as Triangle];
            default:
                return [otherEdge, this.edgeTriangle2 as Triangle];
        }
    }

    disconnectEdge(edgeIndex: number) {
        validateEdgeIndex(edgeIndex);

        const other = this.getConnectedEdge(edgeIndex);
        if (other) {
            const [otherEdgeIndex, otherTriangle] = other;

            this.bitData |= 0b11 << (edgeIndex << 1);
            this.setEdgeTriangle(edgeIndex, null);

            otherTriangle.bitData |= 0b11 << (otherEdgeIndex << 1);
            otherTriangle.setEdgeTriangle(otherEdgeIndex, null);
        }
    }

    connectEdge(edgeIndex: number, otherEdgeIndex: number, otherTriangle: Triangle) {
        validateEdgeIndex(edgeIndex);
        validateEdgeIndex(otherEdgeIndex);

        this.disconnectEdge(edgeIndex);

        const shift = (edgeIndex << 1);
        this.bitData &= ~(0b11 << shift); // clear edge bits
        this.bitData |= otherEdgeIndex << shift; // set edge bits
        this.setEdgeTriangle(edgeIndex, otherTriangle);

        const otherShift = (otherEdgeIndex << 1);
        otherTriangle.bitData &= ~(0b11 << otherShift); // clear edge bits
        otherTriangle.bitData |= edgeIndex << otherShift; // set edge bits
        otherTriangle.setEdgeTriangle(otherEdgeIndex, this);
    }

    getPosition(vertexIndex: number): vec3 {
        const offset = VERTEX_STRIDE * vertexIndex;
        return this.vertexData.slice(offset, offset + 3);
    }

    getNormal(vertexIndex: number): vec3 {
        const offset = VERTEX_STRIDE * vertexIndex + 3;
        return this.vertexData.slice(offset, offset + 3);
    }

    getUV(vertexIndex: number): vec2 {
        const offset = VERTEX_STRIDE * vertexIndex + 6;
        return this.vertexData.slice(offset, offset + 2);
    }

    getTangent(vertexIndex: number): vec4 {
        const offset = VERTEX_STRIDE * vertexIndex + 8;
        return this.vertexData.slice(offset, offset + 4);
    }

    getVertex(vertexIndex: number): Float32Array {
        const offset = VERTEX_STRIDE * vertexIndex;
        return this.vertexData.slice(offset, offset + VERTEX_STRIDE);
    }

    setPosition(vertexIndex: number, newPosition: Readonly<vec3>) {
        const offset = VERTEX_STRIDE * vertexIndex;
        this.vertexData[offset] = newPosition[0];
        this.vertexData[offset + 1] = newPosition[1];
        this.vertexData[offset + 2] = newPosition[2];
    }

    setNormal(vertexIndex: number, newNormal: Readonly<vec3>) {
        const offset = VERTEX_STRIDE * vertexIndex + 3;
        this.vertexData[offset] = newNormal[0];
        this.vertexData[offset + 1] = newNormal[1];
        this.vertexData[offset + 2] = newNormal[2];
    }

    setUV(vertexIndex: number, newUV: Readonly<vec2>) {
        const offset = VERTEX_STRIDE * vertexIndex + 6;
        this.vertexData[offset] = newUV[0];
        this.vertexData[offset + 1] = newUV[1];
    }

    setTangent(vertexIndex: number, newTangent: Readonly<vec4>) {
        const offset = VERTEX_STRIDE * vertexIndex + 8;
        this.vertexData[offset] = newTangent[0];
        this.vertexData[offset + 1] = newTangent[1];
        this.vertexData[offset + 2] = newTangent[2];
        this.vertexData[offset + 3] = newTangent[3];
    }

    hasNormals(vertexIndex: number) {
        const offset = VERTEX_STRIDE * vertexIndex + 3;
        return this.vertexData[offset] && this.vertexData[offset + 1] && this.vertexData[offset + 2];
    }

    getFaceNormal(): vec3 {
        return normalFromTriangle(this.vertexData, this.getPosition(1), this.getPosition(2), vec3.create());
    }

    /**
     * Normalize this triangle's position, in place. Normals are set to be equal
     * to the position. Useful for spherifying a mesh.
     */
    normalize() {
        for (let i = 0; i < VERTEX_TOTAL; i += VERTEX_STRIDE) {
            // normalize positions
            let x = this.vertexData[i];
            let y = this.vertexData[i + 1];
            let z = this.vertexData[i + 2];
            const mul = 1 / Math.sqrt(x * x + y * y + z * z);
            x *= mul;
            y *= mul;
            z *= mul;
            this.vertexData[i] = x;
            this.vertexData[i + 1] = y;
            this.vertexData[i + 2] = z;

            // set normals
            this.vertexData[i + 3] = x;
            this.vertexData[i + 4] = y;
            this.vertexData[i + 5] = z;
        }
    }

    getVertexOffset(vertexIndex: number): number {
        return VERTEX_STRIDE * vertexIndex;
    }

    getVertexStar(vertexIndex: number): VertexStar {
        // assuming that the triangle is part of a manifold that consists only
        // of triangles, then the manifold is a simplicial complex, so the star
        // of the vertex can be queried
        const output: VertexStar = [[this, vertexIndex]];

        // go in the clockwise direction
        let curTri = this as Triangle;
        let curVertexIndex = vertexIndex;
        let looped = false;
        for (;;) {
            // to go in the clockwise direction, the edge we want to follow has
            // the same ID as the vertex we started at
            const edge = curVertexIndex;
            const otherEdgePair = curTri.getConnectedEdge(edge);

            if (otherEdgePair === null) {
                break; // dead end
            }

            [curVertexIndex, curTri] = otherEdgePair;

            if (curTri === this) {
                // looped
                looped = true;
                break;
            }

            // other edge is right after the vertex we want. add 1 to get the
            // other vertex index
            curVertexIndex = (curVertexIndex + 1) % 3;
            output.push([curTri, curVertexIndex]);
        }

        if (looped) {
            // looped, so whole star is already visited
            return output;
        }

        // not looped, so the star needs to be walked in the CCW direction
        curTri = this as Triangle;
        curVertexIndex = vertexIndex;
        for (;;) {
            // to go in the clockwise direction, the edge we want to follow has
            // an ID which is before the vertex we started at
            const edge = (curVertexIndex + 2) % 3;
            const otherEdgePair = curTri.getConnectedEdge(edge);

            if (otherEdgePair === null) {
                break; // dead end
            }

            [curVertexIndex, curTri] = otherEdgePair;

            if (curTri === this) {
                break; // looped
            }

            // other edge starts at the vertex we want, no need to correct
            // vertex index
            output.push([curTri, curVertexIndex]);
        }

        return output;
    }

    translate(offset: vec3): void {
        for (let o = 0; o < VERTEX_TOTAL; o += VERTEX_STRIDE) {
            this.vertexData[o    ] += offset[0];
            this.vertexData[o + 1] += offset[1];
            this.vertexData[o + 2] += offset[2];
        }
    }

    scale(factor: vec3): void {
        for (let o = 0; o < VERTEX_TOTAL; o += VERTEX_STRIDE) {
            this.vertexData[o    ] *= factor[0];
            this.vertexData[o + 1] *= factor[1];
            this.vertexData[o + 2] *= factor[2];
        }
    }

    uniformScale(factor: number): void {
        for (let o = 0; o < VERTEX_TOTAL; o += VERTEX_STRIDE) {
            this.vertexData[o    ] *= factor;
            this.vertexData[o + 1] *= factor;
            this.vertexData[o + 2] *= factor;
        }
    }

    rotate(rotation: quat, rotateNormal = true, rotateTangent = true): void {
        // rotate position
        vec3.transformQuat(this.vertexData, this.vertexData, rotation);
        const pos1 = this.getPosition(1);
        vec3.transformQuat(pos1, pos1, rotation);
        this.setPosition(1, pos1);
        const pos2 = this.getPosition(2);
        vec3.transformQuat(pos2, pos2, rotation);
        this.setPosition(2, pos2);

        if (rotateNormal) {
            // rotate normal
            const norm0 = this.getNormal(0);
            vec3.transformQuat(norm0, norm0, rotation);
            this.setNormal(0, norm0);
            const norm1 = this.getNormal(1);
            vec3.transformQuat(norm1, norm1, rotation);
            this.setNormal(1, norm1);
            const norm2 = this.getNormal(2);
            vec3.transformQuat(norm2, norm2, rotation);
            this.setNormal(2, norm2);
        }

        if (rotateTangent) {
            // rotate tangent
            const tang0 = this.getTangent(0);
            vec4.transformQuat(tang0, tang0, rotation);
            this.setTangent(0, tang0);
            const tang1 = this.getTangent(1);
            vec4.transformQuat(tang1, tang1, rotation);
            this.setTangent(1, tang1);
            const tang2 = this.getTangent(2);
            vec4.transformQuat(tang2, tang2, rotation);
            this.setTangent(2, tang2);
        }
    }

    /**
     * Transform vertices by a given transformation matrix. By default, normals
     * and tangents are also transformed. If they are transformed, then a
     * normal matrix needs to be supplied, otherwise they are not transformed.
     */
    transform(matrix: mat4, normalMatrix?: mat3, transformNormal = true, transformTangent = true): void {
        // transform position
        vec3.transformMat4(this.vertexData, this.vertexData, matrix);
        const pos1 = this.getPosition(1);
        vec3.transformMat4(pos1, pos1, matrix);
        this.setPosition(1, pos1);
        const pos2 = this.getPosition(2);
        vec3.transformMat4(pos2, pos2, matrix);
        this.setPosition(2, pos2);

        if (transformNormal && normalMatrix) {
            // transform normal
            const norm0 = this.getNormal(0);
            vec3.transformMat3(norm0, norm0, normalMatrix);
            this.setPosition(0, norm0);
            const norm1 = this.getNormal(1);
            vec3.transformMat3(norm1, norm1, normalMatrix);
            this.setPosition(1, norm1);
            const norm2 = this.getNormal(2);
            vec3.transformMat3(norm2, norm2, normalMatrix);
            this.setPosition(2, norm2);
        }

        if (transformTangent && normalMatrix) {
            // transform tangent
            // TODO test if this is correct. can we pretend that the tangent is
            // a vec3 and keep the same w value?
            const tang0 = this.getTangent(0);
            vec3.transformMat3(tang0 as vec3, tang0 as vec3, normalMatrix);
            this.setTangent(0, tang0);
            const tang1 = this.getTangent(1);
            vec3.transformMat3(tang1 as vec3, tang1 as vec3, normalMatrix);
            this.setTangent(1, tang1);
            const tang2 = this.getTangent(2);
            vec3.transformMat3(tang2 as vec3, tang2 as vec3, normalMatrix);
            this.setTangent(2, tang2);
        }
    }

    getMidpoint(): vec3 {
        const mid = vec3.clone(this.vertexData);
        vec3.add(mid, mid, this.getPosition(1));
        vec3.add(mid, mid, this.getPosition(2));
        return vec3.scale(mid, mid, THIRD);
    }

    getSurfaceArea(): number {
        const ab = vec3.sub(tmp0, this.getPosition(1), this.vertexData);
        const ac = vec3.sub(tmp1, this.getPosition(2), this.vertexData);
        vec3.cross(tmp0, ab, ac);
        return vec3.length(tmp0) / 2;
    }

    get connectedTriangles(): Tuple<Triangle, NumRange<0, 3>> {
        const out: Array<Triangle> = [];

        if (this.edgeTriangle0) {
            out.push(this.edgeTriangle0);
        }
        if (this.edgeTriangle1) {
            out.push(this.edgeTriangle1);
        }
        if (this.edgeTriangle2) {
            out.push(this.edgeTriangle2);
        }

        return out as Tuple<Triangle, NumRange<0, 3>>;
    }

    positionMatches(vertexIndex: number, otherVertexIndex: number, otherTriangle: Triangle): boolean {
        const i = VERTEX_STRIDE * vertexIndex;
        const j = VERTEX_STRIDE * otherVertexIndex;

        return Math.abs(this.vertexData[i] - otherTriangle.vertexData[j]) < EPS
            && Math.abs(this.vertexData[i + 1] - otherTriangle.vertexData[j + 1]) < EPS
            && Math.abs(this.vertexData[i + 2] - otherTriangle.vertexData[j + 2]) < EPS;
    }

    getMatchingEdge(aVertexIndex: number, bVertexIndex: number, otherTriangle: Triangle): number | null {
        // XXX edges of triangles with opposite winding order are skipped
        if (this.positionMatches(aVertexIndex, 0, otherTriangle)) {
            if (this.positionMatches(bVertexIndex, 2, otherTriangle)) {
                return 2;
            }
        } else if (this.positionMatches(aVertexIndex, 1, otherTriangle)) {
            if (this.positionMatches(bVertexIndex, 0, otherTriangle)) {
                return 0;
            }
        } else if (this.positionMatches(aVertexIndex, 2, otherTriangle)) {
            if (this.positionMatches(bVertexIndex, 1, otherTriangle)) {
                return 1;
            }
        }

        return null;
    }
}