import { MappedSubDivCubeMesh } from './MappedSubDivCubeMesh';
import { vec3 } from 'gl-matrix';

import type { RadialOptions } from './RadialOptions';
import type { vec2 } from 'gl-matrix';

export interface UVSphereOptions extends RadialOptions {
    poleSubDivisions?: number;
}

export class UVSphereMesh extends MappedSubDivCubeMesh {
    constructor(options?: UVSphereOptions) {
        const subDivs = options?.subDivisions ?? 12;
        super(true, subDivs, options?.poleSubDivisions ?? subDivs, options?.radius ?? 0.5);
    }

    protected override mapVertexEquirect(pos: vec3, normal: vec3 | null, texCoord: vec2 | null, radius: number, isFirstHalf: boolean | null) {
        vec3.normalize(pos, pos);

        if (normal) {
            vec3.copy(normal, pos);
        }
        if (texCoord) {
            MappedSubDivCubeMesh.mapEquirectUVs(pos, texCoord, isFirstHalf);
        }

        vec3.scale(pos, pos, radius);
    }

    protected override mapVertexBox(_pos: vec3, _normal: vec3 | null, _radius: number): void {
        throw new Error('Box mapping is not supported by UV spheres');
    }
}