import { MeshIndexType } from '@wonderlandengine/api';

const MAX_INDEX = 0xFFFFFFFF;

export type IndexDataTypeMapping = [indexData: Uint8Array, indexType: MeshIndexType.UnsignedByte] | [indexData: Uint16Array, indexType: MeshIndexType.UnsignedShort] | [indexData: Uint32Array, indexType: MeshIndexType.UnsignedInt];

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

export function makeIndexBufferForType(size: number, meshType: MeshIndexType.UnsignedByte): Uint8Array;
export function makeIndexBufferForType(size: number, meshType: MeshIndexType.UnsignedShort): Uint16Array;
export function makeIndexBufferForType(size: number, meshType: MeshIndexType.UnsignedInt): Uint32Array;
export function makeIndexBufferForType(size: number, meshType: MeshIndexType): Uint8Array | Uint16Array | Uint32Array;
export function makeIndexBufferForType(size: number, meshType: MeshIndexType): Uint8Array | Uint16Array | Uint32Array {
    switch(meshType) {
        case MeshIndexType.UnsignedByte:
            return new Uint8Array(size);
        case MeshIndexType.UnsignedShort:
            return new Uint16Array(size);
        case MeshIndexType.UnsignedInt:
            return new Uint32Array(size);
        default:
            throw new Error(`Unknown mesh index type ID ${meshType}`);
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
    const meshType = getIndexBufferType(vertexCount);
    const buf = makeIndexBufferForType(size, meshType);
    // XXX i don't know how typescript can fail at such a basic type inference,
    // but you've done it. congratulations typescript
    return [buf, meshType] as IndexDataTypeMapping;
}
