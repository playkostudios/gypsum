import { makeIcosahedronBuilder } from './mesh-gen/make-icosahedron-builder';
import { BaseManifoldWLMesh } from './BaseManifoldWLMesh';

import type { Tuple } from './misc/Tuple';
import type { NumRange } from './misc/NumRange';

export interface IcosahedronOptions {
    faceMaterials?: Tuple<WL.Material | null, NumRange<0, 20>>;
}

export class IcosahedronMesh extends BaseManifoldWLMesh {
    constructor(options?: IcosahedronOptions) {
        // make manifold builder populated with icosahedron triangles
        const builder = makeIcosahedronBuilder();

        // make materials map for each face
        const materialMap = new Map();
        const materialsList = options?.faceMaterials ?? [];
        const materialsLen = materialsList.length;
        for (let i = 0; i < 20; i++) {
            if (i < materialsLen) {
                materialMap.set(i, materialsList[i]);
            } else {
                materialMap.set(i, null);
            }
        }

        // convert
        const submeshes = builder.toWLMeshArray(materialMap);
        super(submeshes);
    }

    override clone(): IcosahedronMesh {
        throw new Error('Not implemented yet');
    }
}