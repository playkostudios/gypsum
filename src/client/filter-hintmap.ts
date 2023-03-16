import { filterHint } from './filter-hint';

import type { HintMap } from '../common/HintMap';

export function filterHintMap(supportsNormals: boolean, supportsUVs: boolean, supportsTangents: boolean, supportsColors: boolean, hintMap?: HintMap): HintMap {
    const newHintMap: HintMap = new Map();

    // filter passed hints
    if (hintMap) {
        for (const [key, hint] of hintMap) {
            newHintMap.set(key, filterHint(supportsNormals, supportsUVs, supportsTangents, supportsColors, hint));
        }
    }

    // add default hint if missing
    if (!newHintMap.has(null)) {
        newHintMap.set(null, filterHint(supportsNormals, supportsUVs, supportsTangents, supportsColors));
    }

    return newHintMap;
}