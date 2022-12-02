export function makeCuboidMaterialMap(defaultMaterial?: WL.Material | null, leftMaterial?: WL.Material | null, rightMaterial?: WL.Material | null, downMaterial?: WL.Material | null, upMaterial?: WL.Material | null, backMaterial?: WL.Material | null, frontMaterial?: WL.Material | null) {
    const materialMap = new Map<number, WL.Material | null>();
    for (let i = 0; i < 6; i++) {
        materialMap.set(i, defaultMaterial);
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