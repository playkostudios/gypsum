// XXX modified TriangleHasher from our OctreeCSG-ea project, but reused for
// vertex positions instead of triangles
// XXX initially this used murmurhash, but there was a 100% collision rate when
// not using uvs because having 0 as an input ruins murmurhash. now everything
// is just xor'ed together

/**
 * A helper class which hashes vertices to check for uniqueness.
 */
export default class VertexHasher {
    buckets = new Map<number, [Array<Float32Array>, Array<number>]>;
    readonly byteLength: number;

    constructor(public readonly floatCount = 3) {
        this.byteLength = floatCount * 4;
    }

    private getHash(vertexDataBuffer: ArrayBuffer, byteOffset: number): number {
        let h = 0xea8ed414;
        const view = new Uint32Array(vertexDataBuffer, byteOffset);
        for (let i = 0; i < this.floatCount; i++) {
            h ^= view[i];
        }

        return h;
    }

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

    isUnique(vertexData: Float32Array, offset = 0): boolean {
        return this.getAuxIdx(vertexData, -1, offset) === null;
    }

    clear() {
        this.buckets.clear();
    }
}