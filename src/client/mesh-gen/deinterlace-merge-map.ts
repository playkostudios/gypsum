import type { DynamicArray } from '../../common/DynamicArray';
import type { MergeMap } from '../../common/MergeMap';

export function deinterlaceMergeMap(interlacedMergeMap: DynamicArray<Uint32ArrayConstructor>): MergeMap {
    const mergeMapLen = interlacedMergeMap.length / 2;
    const mergeFromMap = new Uint32Array(mergeMapLen);
    const mergeToMap = new Uint32Array(mergeMapLen);

    for (let ii = 0, di = 0; di < mergeMapLen;) {
        mergeFromMap[di] = interlacedMergeMap[ii++];
        mergeToMap[di++] = interlacedMergeMap[ii++];
    }

    return [mergeFromMap, mergeToMap];
}