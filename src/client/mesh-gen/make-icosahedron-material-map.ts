import type { NumRange } from '../misc/NumRange';
import type { Tuple } from '../misc/Tuple';

export function makeIcosahedronMaterialMap(faceMaterials?: Tuple<WL.Material | null, NumRange<0, 20>> | WL.Material) {
    // make materials map for each face
    const materialMap = new Map<number, WL.Material | null>();
    const materialsList: Array<WL.Material | null> | WL.Material = faceMaterials ?? [];

    if (Array.isArray(materialsList)) {
        const materialsLen = materialsList.length;
        for (let i = 0; i < 20; i++) {
            if (i < materialsLen) {
                materialMap.set(i, materialsList[i]);
            } else {
                materialMap.set(i, null);
            }
        }
    } else {
        // here materialsList is not a materials list, but a single material
        // that is applied to all faces
        for (let i = 0; i < 20; i++) {
            materialMap.set(i, materialsList);
        }
    }

    return materialMap;
}