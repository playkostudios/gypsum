import { makeCuboidBuilder } from './mesh-gen/make-cuboid-builder';
import { MeshGroup } from './MeshGroup';

import type { RadialOptions } from './RadialOptions';
import type { vec2 } from 'gl-matrix';

const NO_UVS: [vec2, vec2, vec2, vec2] = [[0,0],[0,0],[0,0],[0,0]];

/** Optional arguments for UV sphere generation. */
export interface UVSphereOptions extends RadialOptions {
    /** The material used for all triangles in the sphere. */
    material?: WL.Material;
}

/**
 * A procedural sphere made by normalizing a cube.
 *
 * @category Procedural Mesh
 */
export class UVSphereMesh extends MeshGroup {
    /**
     * Create a new UV sphere. By default, has a radius of 0.5. All UV spheres
     * have an approximation of equirectangular mapping if the material used is
     * textured.
     *
     * @param options - Optional arguments for the sphere.
     */
    constructor(options?: UVSphereOptions) {
        const subDivs = options?.subDivisions ?? 12;
        const radius = options?.radius ?? 0.5;
        const diameter = radius * 2;

        const builder = makeCuboidBuilder(
            subDivs, diameter, diameter, diameter, true, false,
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