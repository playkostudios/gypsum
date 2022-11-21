import { MappedSubDivCubeMesh } from './MappedSubDivCubeMesh';
import { vec3 } from 'gl-matrix';

import type { RadialOptions } from './RadialOptions';
import type { vec2 } from 'gl-matrix';

const THIRD = 1 / 3;

type CubeSphereOptions = RadialOptions & ({
    equirectangular: true;
    poleSubDivisions?: number;
} | {
    equirectangular?: false;
    leftMaterial?: WL.Material;
    rightMaterial?: WL.Material;
    downMaterial?: WL.Material;
    upMaterial?: WL.Material;
    backMaterial?: WL.Material;
    frontMaterial?: WL.Material;
});

function mapCubeToSphere(pos: vec3) {
    // XXX algorithm expects inputs to be in the range -1:1, not -0.5:0.5
    vec3.scale(pos, pos, 2);
    const xSqr = pos[0] * pos[0];
    const ySqr = pos[1] * pos[1];
    const zSqr = pos[2] * pos[2];

    pos[0] *= Math.sqrt(1 - 0.5 * (ySqr + zSqr) + ySqr * zSqr * THIRD);
    pos[1] *= Math.sqrt(1 - 0.5 * (zSqr + xSqr) + zSqr * xSqr * THIRD);
    pos[2] *= Math.sqrt(1 - 0.5 * (xSqr + ySqr) + xSqr * ySqr * THIRD);
}

export { CubeSphereOptions };

export class CubeSphereMesh extends MappedSubDivCubeMesh {
    constructor(options?: CubeSphereOptions) {
        const subDivs = options?.subDivisions ?? 12;
        const radius = options?.radius ?? 0.5;

        if (options?.equirectangular) {
            super(true, subDivs, options?.poleSubDivisions ?? subDivs, radius);
        } else {
            super(
                false, subDivs, 0, radius,
                options?.leftMaterial, options?.rightMaterial,
                options?.downMaterial, options?.upMaterial,
                options?.backMaterial, options?.frontMaterial
            );
        }
    }

    protected override mapVertexEquirect(pos: vec3, normal: vec3 | null, texCoord: vec2 | null, radius: number, isFirstHalf: boolean | null) {
        mapCubeToSphere(pos);

        if (normal) {
            vec3.copy(normal, pos);
        }
        if (texCoord) {
            MappedSubDivCubeMesh.mapEquirectUVs(pos, texCoord, isFirstHalf);
        }

        vec3.scale(pos, pos, radius);
    }

    protected override mapVertexBox(pos: vec3, normal: vec3 | null, radius: number): void {
        mapCubeToSphere(pos);

        if (normal) {
            vec3.copy(normal, pos);
        }

        vec3.scale(pos, pos, radius);
    }
}