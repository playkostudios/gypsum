import { makeIcosahedronMaterialMap } from './mesh-gen/make-icosahedron-material-map';
import { makeIcosahedronBuilder } from './mesh-gen/make-icosahedron-builder';
import { BaseManifoldWLMesh } from './BaseManifoldWLMesh';

import type { Tuple } from './misc/Tuple';
import type { NumRange } from './misc/NumRange';

export interface IcosahedronOptions {
    faceMaterials?: Tuple<WL.Material | null, NumRange<0, 20>>;
    radius?: number;
}

export class IcosahedronMesh extends BaseManifoldWLMesh {
    constructor(options?: IcosahedronOptions) {
        // make manifold builder populated with icosahedron triangles
        const builder = makeIcosahedronBuilder();

        // scale
        builder.uniformScale(options?.radius ?? 0.5);

        // convert
        super(...builder.finalize(makeIcosahedronMaterialMap(options?.faceMaterials)));
    }
}