import type { Material } from '@wonderlandengine/api';

/**
 * Creates a map which maps the material IDs used by {@link makeCuboidBuilder}
 * to actual WL.Material instances.
 *
 * @param defaultMaterial - The material to use for any missing or null material.
 * @param leftMaterial - The material to use for the left (-X) face.
 * @param rightMaterial - The material to use for the right (+X) face.
 * @param downMaterial - The material to use for the down (-Y) face.
 * @param upMaterial - The material to use for the up (+Y) face.
 * @param backMaterial - The material to use for the back (-Z) face.
 * @param frontMaterial - The material to use for the front (+Z) face.
 * @returns A new Map which maps a material ID to a WL.Material instance, or null if no material was available for the face.
 */
export function makeCuboidMaterialMap(defaultMaterial?: Material | null, leftMaterial?: Material | null, rightMaterial?: Material | null, downMaterial?: Material | null, upMaterial?: Material | null, backMaterial?: Material | null, frontMaterial?: Material | null): Map<number, Material | null> {
    const materialMap = new Map<number, Material | null>();
    for (let i = 0; i < 6; i++) {
        materialMap.set(i, defaultMaterial ?? null);
    }

    if (leftMaterial) {
        materialMap.set(0, leftMaterial);
    }
    if (rightMaterial) {
        materialMap.set(1, rightMaterial);
    }
    if (downMaterial) {
        materialMap.set(2, downMaterial);
    }
    if (upMaterial) {
        materialMap.set(3, upMaterial);
    }
    if (backMaterial) {
        materialMap.set(4, backMaterial);
    }
    if (frontMaterial) {
        materialMap.set(5, frontMaterial);
    }

    return materialMap;
}