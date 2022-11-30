import { makeCuboidBuilder } from './mesh-gen/make-cuboid-builder';
import { BaseManifoldWLMesh } from './BaseManifoldWLMesh';

import type { CuboidFaceUVs, CuboidFaceUVPosRatio } from './mesh-gen/make-cuboid-builder';

export interface CuboidMaterialOptions {
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
            1, width, height, depth, options?.center ?? true,
            options?.leftUVs, options?.rightUVs, options?.downUVs,
            options?.upUVs, options?.backUVs, options?.frontUVs,
        ).finalize(new Map([
            [ 0, options?.leftMaterial ?? null ],
            [ 1, options?.rightMaterial ?? null ],
            [ 2, options?.downMaterial ?? null ],
            [ 3, options?.upMaterial ?? null ],
            [ 4, options?.backMaterial ?? null ],
            [ 5, options?.frontMaterial ?? null ],
        ])));
    }
}