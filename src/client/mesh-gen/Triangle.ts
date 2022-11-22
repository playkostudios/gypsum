import type { vec2, vec3 } from 'gl-matrix';

function validateEdgeIndex(edgeIndex: number) {
    if ([0, 1, 2].indexOf(edgeIndex) === -1) {
        throw new Error(`Invalid edge index (${edgeIndex})`);
    }
}

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
     * Bits 6-51:
     *   45-bit material ID. Triangles with different material IDs will be put
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
     * The positions, normals and UVs of each triangle. UVs are optional; if the
     * length of this array is 18, then UVs are not available, else (if 24),
     * then UVs are available.
     *
     * The format is not interleaved:
     * - float 0-2: vertex 0's position
     * - float 3-5: vertex 1's position
     * - float 6-8: vertex 2's position
     * - float 9-11: vertex 0's normal
     * - float 12-14: vertex 1's normal
     * - float 15-17: vertex 2's normal
     * - float 18-19: vertex 0's UV
     * - float 20-21: vertex 1's UV
     * - float 22-23: vertex 2's UV
     */
    private vertexData: Float32Array;

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
        }
    }

    get materialID(): number {
        return this.bitData >> 6;
    }

    get hasUVs(): boolean {
        return this.vertexData.length === 24;
    }

    constructor(hasUVs = false) {
        this.vertexData = new Float32Array(hasUVs ? 24 : 18);
    }

    getConnectedEdge(edgeIndex: number): [number, Triangle] | null {
        validateEdgeIndex(edgeIndex);

        const otherEdge = (this.bitData >> (edgeIndex << 1)) & 0b11;
        switch(otherEdge) {
            case 0:
                return [otherEdge, this.edgeTriangle0 as Triangle];
            case 1:
                return [otherEdge, this.edgeTriangle1 as Triangle];
            case 2:
                return [otherEdge, this.edgeTriangle2 as Triangle];
            default:
                return null;
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
        const offset = 3 * vertexIndex;
        return this.vertexData.slice(offset, offset + 3);
    }

    getNormal(vertexIndex: number): vec3 {
        const offset = 3 * vertexIndex + 9;
        return this.vertexData.slice(offset, offset + 3);
    }

    getUV(vertexIndex: number): vec2 {
        const offset = 2 * vertexIndex + 18;
        return this.vertexData.slice(offset, offset + 2);
    }

    setPosition(vertexIndex: number, newPosition: vec3) {
        const offset = 3 * vertexIndex;
        this.vertexData[offset] = newPosition[0];
        this.vertexData[offset + 1] = newPosition[1];
        this.vertexData[offset + 2] = newPosition[2];
    }

    setNormal(vertexIndex: number, newNormal: vec3) {
        const offset = 3 * vertexIndex + 9;
        this.vertexData[offset] = newNormal[0];
        this.vertexData[offset + 1] = newNormal[1];
        this.vertexData[offset + 2] = newNormal[2];
    }

    setUV(vertexIndex: number, newUV: vec2) {
        const offset = 2 * vertexIndex + 18;
        this.vertexData[offset] = newUV[0];
        this.vertexData[offset + 1] = newUV[1];
    }
}