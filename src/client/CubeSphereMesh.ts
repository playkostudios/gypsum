import { makeCuboidBuilder } from './mesh-gen/make-cuboid-builder';
import { BaseManifoldWLMesh } from './BaseManifoldWLMesh';
import { vec3 } from 'gl-matrix';

import type { CuboidFaceUVPosRatio, CuboidFaceUVs } from './mesh-gen/make-cuboid-builder';
import type { RadialOptions } from './RadialOptions';
import type { vec2 } from 'gl-matrix';
import type { ManifoldBuilder } from './mesh-gen/ManifoldBuilder';

const THIRD = 1 / 3;
const NO_UVS: [vec2, vec2, vec2, vec2] = [[0,0],[0,0],[0,0],[0,0]];

type CubeSphereOptions = RadialOptions & ({
    equirectangular: true;
} | {
    equirectangular?: false;
    leftUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio;
    rightUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio;
    downUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio;
    upUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio;
    backUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio;
    frontUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio;
}) & {
    material?: WL.Material;
    leftMaterial?: WL.Material;
    rightMaterial?: WL.Material;
    downMaterial?: WL.Material;
    upMaterial?: WL.Material;
    backMaterial?: WL.Material;
    frontMaterial?: WL.Material;
};

function mapCubeToSphere(x: number, y: number, z: number): vec3 {
    // XXX algorithm expects inputs to be in the range -1:1, not -0.5:0.5
    x *= 2;
    y *= 2;
    z *= 2;

    const xSqr = x * x;
    const ySqr = y * y;
    const zSqr = z * z;

    x *= Math.sqrt(1 - 0.5 * (ySqr + zSqr) + ySqr * zSqr * THIRD);
    y *= Math.sqrt(1 - 0.5 * (zSqr + xSqr) + zSqr * xSqr * THIRD);
    z *= Math.sqrt(1 - 0.5 * (xSqr + ySqr) + xSqr * ySqr * THIRD);

    return [x, y, z];
}

export { CubeSphereOptions };

export class CubeSphereMesh extends BaseManifoldWLMesh {
    constructor(options?: CubeSphereOptions) {
        const subDivs = options?.subDivisions ?? 12;
        const radius = options?.radius ?? 0.5;
        const diameter = radius * 2;

        let materialMap: Map<number, WL.Material>;
        if (options?.material) {
            materialMap = new Map();
            for (let i = 0; i < 6; i++) {
                materialMap.set(i, options.material);
            }
        } else {
            materialMap = new Map([
                [ 0, options?.leftMaterial ?? null ],
                [ 1, options?.rightMaterial ?? null ],
                [ 2, options?.downMaterial ?? null ],
                [ 3, options?.upMaterial ?? null ],
                [ 4, options?.backMaterial ?? null ],
                [ 5, options?.frontMaterial ?? null ],
            ]);
        }

        let builder: ManifoldBuilder;
        if (options?.equirectangular) {
            builder = makeCuboidBuilder(
                subDivs, diameter, diameter, diameter, true,
                NO_UVS, NO_UVS, NO_UVS, NO_UVS, NO_UVS, NO_UVS,
            );
        } else {
            builder = makeCuboidBuilder(
                subDivs, diameter, diameter, diameter, true,
                options?.leftUVs, options?.rightUVs, options?.downUVs,
                options?.upUVs, options?.backUVs, options?.frontUVs,
            );
        }

        builder.warpPositions(mapCubeToSphere);
        builder.normalize();

        if (options?.equirectangular) {
            builder.makeEquirectUVs();
        }

        super(...builder.finalize(materialMap));
    }
}