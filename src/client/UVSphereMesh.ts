import { makeCuboidBuilder } from './mesh-gen/make-cuboid-builder';
import { BaseManifoldWLMesh } from './BaseManifoldWLMesh';

import type { RadialOptions } from './RadialOptions';
import type { vec2 } from 'gl-matrix';

const NO_UVS: [vec2, vec2, vec2, vec2] = [[0,0],[0,0],[0,0],[0,0]];

export interface UVSphereOptions extends RadialOptions {
    material?: WL.Material;
}

export class UVSphereMesh extends BaseManifoldWLMesh {
    constructor(options?: UVSphereOptions) {
        const subDivs = options?.subDivisions ?? 12;
        const radius = options?.radius ?? 0.5;
        const diameter = radius * 2;

        const builder = makeCuboidBuilder(
            subDivs, diameter, diameter, diameter, true,
            NO_UVS, NO_UVS, NO_UVS, NO_UVS, NO_UVS, NO_UVS,
        );

        builder.normalize();
        builder.makeEquirectUVs();

        const material = options?.material ?? null;
        const materialMap = new Map<number, WL.Material>();
        for (let i = 0; i < 6; i++) {
            materialMap.set(i, material);
        }

        super(...builder.finalize(materialMap));
    }
}