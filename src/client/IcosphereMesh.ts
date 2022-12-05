import { makeIcosahedronMaterialMap } from './mesh-gen/make-icosahedron-material-map';
import { makeIcosahedronBuilder } from './mesh-gen/make-icosahedron-builder';
import { MeshGroup } from './MeshGroup';

import type { Tuple } from './misc/Tuple';
import type { NumRange } from './misc/NumRange';
import type { RadialOptions } from './RadialOptions';

/** Optional arguments for a procedural icosphere. */
export interface IcosphereOptions extends RadialOptions {
    /**
     * The material to use for each face. Can either be an array with 20
     * materials, or a single materials that is assigned to all faces.
     */
    faceMaterials?: Tuple<WL.Material | null, NumRange<0, 20>> | WL.Material;
    /** The radius of the sphere. */
    radius?: number;
    /**
     * Does the icosphere have an equirectangular projection? False by default.
     */
    equirectangular?: boolean;
}

/**
 * A procedural sphere made by splitting and normalizing an icosahedron.
 *
 * @category Procedural Mesh
 */
export class IcosphereMesh extends MeshGroup {
    /**
     * Create a new icosphere. By default, has a radius of 0.5.
     *
     * @param options - Optional arguments for the sphere.
     */
    constructor(options?: IcosphereOptions) {
        // make manifold builder populated with icosahedron triangles
        const builder = makeIcosahedronBuilder(false);

        // subdivide and normalize manifold (spherify icosahedron)
        const subDivisions = options?.subDivisions ?? 2;
        for (let i = 0; i < subDivisions; i++) {
            builder.subDivide4();
        }

        builder.normalize();

        // make equirectangular UVs
        if (options?.equirectangular ?? false) {
            builder.makeEquirectUVs();
        }

        // make sure sphere has the right scale. radius defaults to 0.5, since
        // all primitives default to having a 1x1x1 AABB
        builder.uniformScale(options?.radius ?? 0.5);

        // convert
        super(...builder.finalize(makeIcosahedronMaterialMap(options?.faceMaterials)));
    }
}