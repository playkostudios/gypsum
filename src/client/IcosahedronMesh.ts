import { makeIcosahedronMaterialMap } from './mesh-gen/make-icosahedron-material-map';
import { makeIcosahedronBuilder } from './mesh-gen/make-icosahedron-builder';
import { MeshGroup } from './MeshGroup';

import type { Tuple } from './misc/Tuple';
import type { NumRange } from './misc/NumRange';

/**
 * Optional arguments for a procedural icosahedron.
 */
export interface IcosahedronOptions {
    /**
     * The material to use for each face. Can either be an array with 20
     * materials, or a single materials that is assigned to all faces.
     */
    faceMaterials?: Tuple<WL.Material | null, NumRange<0, 20>> | WL.Material;
    /** The radius of the icosahedron. */
    radius?: number;
}

/**
 * A regular icosahedron; a 20-sided polyhedron.
 *
 * @category Procedural Mesh
 */
export class IcosahedronMesh extends MeshGroup {
    /**
     * Make a new icosahedron.
     *
     * @param options - Optional arguments for the generation.
     */
    constructor(options?: IcosahedronOptions) {
        // make manifold builder populated with icosahedron triangles
        const builder = makeIcosahedronBuilder();

        // scale
        builder.uniformScale(options?.radius ?? 0.5);

        // convert
        super(...builder.finalize(makeIcosahedronMaterialMap(options?.faceMaterials)));
    }
}