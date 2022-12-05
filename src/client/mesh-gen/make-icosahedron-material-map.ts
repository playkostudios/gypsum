import type { NumRange } from '../misc/NumRange';
import type { Tuple } from '../misc/Tuple';

/**
 * Creates a map which maps the material IDs used by
 * {@link makeIcosahedronBuilder} to actual WL.Material instances.
 *
 * @param faceMaterials - The material to use for each face. Can either be an array with 20 materials, or a single materials that is assigned to all faces.
 * @returns A new Map which maps a material ID to a WL.Material instance, or null if no material was available for the face.
 */
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