import { getIndexBufferType, IndexDataTypeMapping, makeIndexBufferForType } from './makeIndexBuffer';

import type { MeshIndexType } from '@wonderlandengine/api';

/**
 * Optimize an index buffer. If the index buffer is already optimal, it is
 * reused.
 */
export function optimizeIndexData(indexData: Uint8Array | Uint16Array | Uint32Array, curIndexDataType: MeshIndexType, indexCount: number, vertexCount: number): IndexDataTypeMapping {
    const optimalIndexBufferType = getIndexBufferType(vertexCount);
    if (optimalIndexBufferType !== curIndexDataType) {
        const optimalIndexData = makeIndexBufferForType(indexCount, optimalIndexBufferType);
        optimalIndexData.set(indexData);
        return [optimalIndexData, optimalIndexBufferType] as IndexDataTypeMapping;
    } else {
        return [indexData, optimalIndexBufferType] as IndexDataTypeMapping;
    }
}