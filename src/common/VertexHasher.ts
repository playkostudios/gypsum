// XXX modified TriangleHasher from our OctreeCSG-ea project, but reused for
// vertex positions instead of triangles
export default class VertexHasher {
    buckets = new Map<number, Float32Array[]>;

    private murmur_32_scramble(k: number): number {
        k *= 0xcc9e2d51;
        k = (k << 15) | (k >> 17);
        k *= 0x1b873593;
        return k & 0xffffffff;
    }

    private murmur3_32(data: Float32Array, seed: number): number {
        let h = seed;

        /* Read in groups of 4. */
        const view = new Uint32Array(data.buffer);
        for (const key of view) {
            h ^= this.murmur_32_scramble(key);
            h = ((h << 13) & 0xffffffff) | (h >> 19);
            h = (h * 5 + 0xe6546b64) & 0xffffffff;
        }

        /* Finalize. */
        h ^= view.byteLength;
        h ^= h >> 16;
        h = (h * 0x85ebca6b) & 0xffffffff;
        h ^= h >> 13;
        h = (h * 0xc2b2ae35) & 0xffffffff;
        h ^= h >> 16;
        return h;
    }

    private getHash(pos: Float32Array): number {
        return this.murmur3_32(pos, 0xea8ed414);
    }

    isUnique(pos: Float32Array) {
        const hash = this.getHash(pos);
        const arr = this.buckets.get(hash);

        if (arr) {
            for (const other of arr) {
                if (pos[0] === other[0] && pos[1] === other[1] && pos[2] === other[2]) {
                    return false;
                }
            }

            arr.push(pos);
        } else {
            this.buckets.set(hash, [pos]);
        }

        return true;
    }

    clear() {
        this.buckets.clear();
    }
}