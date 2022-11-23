// XXX modified TriangleHasher from our OctreeCSG-ea project, but reused for
// vertex positions instead of triangles
// XXX initially this used murmurhash, but there was a 100% collision rate when
// not using uvs because having 0 as an input ruins murmurhash. now everything
// is just xor'ed together
export default class VertexHasher {
    buckets = new Map<number, Float32Array[]>;
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

    isUnique(vertexData: Float32Array, offset = 0) {
        const byteOffset = vertexData.byteOffset + offset * 4;
        const hash = this.getHash(vertexData.buffer, byteOffset);
        let arr = this.buckets.get(hash);

        if (arr) {
            for (const other of arr) {
                let equal = true;
                // console.log(vertexData, other);
                for (let i = 0; i < this.floatCount; i++) {
                    if (vertexData[offset + i] !== other[i]) {
                        equal = false;
                        break;
                    }
                }

                if (equal) {
                    return false;
                }
            }
        } else {
            arr = [];
            this.buckets.set(hash, arr);
        }

        if(offset === 0) {
            arr.push(vertexData);
        } else {
            const clonedData = new Float32Array(vertexData.buffer, byteOffset, this.floatCount);
            arr.push(clonedData);
        }

        return true;
    }

    clear() {
        this.buckets.clear();
    }
}