// XXX modified TriangleHasher from our OctreeCSG-ea project, but reused for
// vertex positions instead of triangles
// XXX initially this used murmurhash, but there was a 100% collision rate when
// not using uvs because having 0 as an input ruins murmurhash. now everything
// is just xor'ed together

/**
 * A helper class which hashes vertices to check for uniqueness.
 */
export default class VertexHasher {
    /** Buckets containing found vertices and indices using the vertex. */
    buckets = new Map<number, [Array<Float32Array>, Array<number>]>;

    /**
     * @param floatCount - The amount of floats per vertex. 3 by default (only position tracked)
     */
    constructor(public readonly floatCount = 3) {}

    /** Internal method. Make a hash from vertex data */
    private getHash(vertexDataBuffer: ArrayBuffer, byteOffset: number): number {
        let h = 0xea8ed414;
        const view = new Uint32Array(vertexDataBuffer, byteOffset);
        for (let i = 0; i < this.floatCount; i++) {
            h ^= view[i];
        }

        return h;
    }

    /**
     * Get auxiliary index for vertex. If the vertex was already found, the
     * index of the vertex in a vertex array is returned, otherwise, null is
     * returned.
     *
     * @param vertexData - The vertex, or a buffer containing the buffer
     * @param auxIdx - The index to track if never found. -1 by default
     * @param offset - The offset to use if vertexData is a buffer. 0 by default
     */
    getAuxIdx(vertexData: Float32Array, auxIdx = -1, offset = 0): null | number {
        const byteOffset = vertexData.byteOffset + offset * 4;
        const hash = this.getHash(vertexData.buffer, byteOffset);
        let bucket = this.buckets.get(hash);

        if (bucket) {
            const bucketVA = bucket[0];
            const bucketSize = bucketVA.length;

            for (let i = 0; i < bucketSize; i++) {
                const otherVertexData = bucketVA[i];
                let equal = true;
                for (let j = 0; j < this.floatCount; j++) {
                    if (vertexData[offset + j] !== otherVertexData[j]) {
                        equal = false;
                        break;
                    }
                }

                if (equal) {
                    return bucket[1][i];
                }
            }
        } else {
            bucket = [[], []];
            this.buckets.set(hash, bucket);
        }

        if(offset === 0) {
            bucket[0].push(vertexData);
        } else {
            const clonedData = new Float32Array(vertexData.buffer, byteOffset, this.floatCount);
            bucket[0].push(clonedData);
        }

        bucket[1].push(auxIdx);
        return null;
    }

    /**
     * Check if the vertex has ever been found.
     *
     * @param vertexData - The vertex, or a buffer containing the buffer
     * @param offset - The offset to use if vertexData is a buffer. 0 by default
     */
    isUnique(vertexData: Float32Array, offset = 0): boolean {
        return this.getAuxIdx(vertexData, -1, offset) === null;
    }

    /** Clear the buckets; resets the hasher, but keeps the same floatCount. */
    clear() {
        this.buckets.clear();
    }
}