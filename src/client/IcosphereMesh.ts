import { makeIcosahedronMaterialMap } from './mesh-gen/make-icosahedron-material-map';
import { makeIcosahedronBuilder } from './mesh-gen/make-icosahedron-builder';
import { BaseManifoldWLMesh } from './BaseManifoldWLMesh';

import type { Tuple } from './misc/Tuple';
import type { NumRange } from './misc/NumRange';
import type { RadialOptions } from './RadialOptions';

export interface IcosphereOptions extends RadialOptions {
    faceMaterials?: Tuple<WL.Material | null, NumRange<0, 20>> | WL.Material;
    radius?: number;
    equirectangular?: boolean;
}

export class IcosphereMesh extends BaseManifoldWLMesh {
    constructor(options?: IcosphereOptions) {
        // make manifold builder populated with icosahedron triangles
        const builder = makeIcosahedronBuilder();

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