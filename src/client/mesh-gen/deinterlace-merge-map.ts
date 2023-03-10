import type { DynamicArray } from '../../common/DynamicArray';
import type { MergeMap } from '../../common/MergeMap';

/**
 * De-interlace an interlaced merge map. An interlaced merge map is a merge map
 * encoded as a single DynamicArray, where each even index starting from zero
 * is a value in the `mergeFromVert` array, while every odd index starting from
 * zero is a value in the `mergeToVert` array.
 *
 * @param interlacedMergeMap - The interlaced MergeMap to de-interlace
 * @returns A de-interlaced MergeMap
 */
export function deinterlaceMergeMap(interlacedMergeMap: DynamicArray<Uint32ArrayConstructor>): MergeMap {
    const mergeMapLen = interlacedMergeMap.length / 2;
    const mergeFromMap = new Uint32Array(mergeMapLen);
    const mergeToMap = new Uint32Array(mergeMapLen);

    for (let ii = 0, di = 0; di < mergeMapLen;) {
        mergeFromMap[di] = interlacedMergeMap.get_guarded(ii++);
        mergeToMap[di++] = interlacedMergeMap.get_guarded(ii++);
    }

    return [mergeFromMap, mergeToMap];
}