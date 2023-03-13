import { MeshIndexType } from '@wonderlandengine/api';

const MAX_INDEX = 0xFFFFFFFF;

/** A mapping from an index buffer type to a mesh index type */
export type IndexDataTypeMapping = [indexData: Uint8Array, indexType: MeshIndexType.UnsignedByte] | [indexData: Uint16Array, indexType: MeshIndexType.UnsignedShort] | [indexData: Uint32Array, indexType: MeshIndexType.UnsignedInt];

/** Get the mesh index type needed to index a given vertex count */
export function getIndexBufferType(vertexCount: number): MeshIndexType {
    const vertexCountM1 = vertexCount - 1;

    if (vertexCountM1 <= 0xFF) {
        return MeshIndexType.UnsignedByte;
    } else if (vertexCountM1 <= 0xFFFF) {
        return MeshIndexType.UnsignedShort;
    } else if (vertexCountM1 <= MAX_INDEX) {
        return MeshIndexType.UnsignedInt;
    } else {
        throw new Error(`Maximum index exceeded (${MAX_INDEX})`);
    }
}

/**
 * Make an indexData buffer for the creation of a WL.Mesh instance given a
 * specific mesh index type.
 *
 * @param size - The ammount of indices in the indexData buffer.
 * @param meshIndexType - The mesh index type, which decides the byte size per index.
 * @returns A tuple containing the indexData buffer, and the indexType argument to be passed to the WL.Mesh constructor.
 */
export function makeIndexBufferForType(size: number, meshIndexType: MeshIndexType.UnsignedByte): Uint8Array;
export function makeIndexBufferForType(size: number, meshIndexType: MeshIndexType.UnsignedShort): Uint16Array;
export function makeIndexBufferForType(size: number, meshIndexType: MeshIndexType.UnsignedInt): Uint32Array;
export function makeIndexBufferForType(size: number, meshIndexType: MeshIndexType): Uint8Array | Uint16Array | Uint32Array;
export function makeIndexBufferForType(size: number, meshIndexType: MeshIndexType): Uint8Array | Uint16Array | Uint32Array {
    switch(meshIndexType) {
        case MeshIndexType.UnsignedByte:
            return new Uint8Array(size);
        case MeshIndexType.UnsignedShort:
            return new Uint16Array(size);
        case MeshIndexType.UnsignedInt:
            return new Uint32Array(size);
        default:
            throw new Error(`Unknown mesh index index type ID ${meshIndexType}`);
    }
}

/**
 * Make an indexData buffer for the creation of a WL.Mesh instance.
 * Automatically decides the most memory-efficient TypedArray for the
 * buffer.
 *
 * @param size - The ammount of indices in the indexData buffer.
 * @param vertexCount - The amount of vertices that will be indexed.
 * @returns A tuple containing the indexData buffer, and the indexType argument to be passed to the WL.Mesh constructor.
 */
export function makeIndexBuffer(size: number, vertexCount: number): IndexDataTypeMapping {
    const meshIndexType = getIndexBufferType(vertexCount);
    const buf = makeIndexBufferForType(size, meshIndexType);
    // XXX i don't know how typescript can fail at such a basic type inference,
    // but you've done it. congratulations typescript
    return [buf, meshIndexType] as IndexDataTypeMapping;
}
