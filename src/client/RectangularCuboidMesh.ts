import { makeCuboidBuilder } from './mesh-gen/make-cuboid-builder';
import { BaseManifoldWLMesh } from './BaseManifoldWLMesh';
import { makeCuboidMaterialMap } from './mesh-gen/make-cuboid-material-map';

import type { CuboidFaceUVs, CuboidFaceUVPosRatio } from './mesh-gen/make-cuboid-builder';

export interface CuboidMaterialOptions {
    material?: WL.Material;
    leftMaterial?: WL.Material;
    rightMaterial?: WL.Material;
    downMaterial?: WL.Material;
    upMaterial?: WL.Material;
    backMaterial?: WL.Material;
    frontMaterial?: WL.Material;
}

export interface CuboidOptions extends CuboidMaterialOptions {
    leftUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio;
    rightUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio;
    downUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio;
    upUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio;
    backUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio;
    frontUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio;
    center?: boolean;
}

export class RectangularCuboidMesh extends BaseManifoldWLMesh {
    constructor(width: number, height: number, depth: number, options?: CuboidOptions) {
        super(...makeCuboidBuilder(
            1, width, height, depth, options?.center ?? true, true,
            options?.leftUVs, options?.rightUVs, options?.downUVs,
            options?.upUVs, options?.backUVs, options?.frontUVs,
        ).finalize(makeCuboidMaterialMap(
            options?.material,
            options?.leftMaterial, options?.rightMaterial,
            options?.downMaterial, options?.upMaterial,
            options?.backMaterial, options?.frontMaterial,
        )));
    }
}