import { makeCuboidBuilder } from './mesh-gen/make-cuboid-builder';
import { MeshGroup } from './MeshGroup';
import { makeCuboidMaterialMap } from './mesh-gen/make-cuboid-material-map';

import type { CuboidFaceUVs, CuboidFaceUVPosRatio } from './mesh-gen/make-cuboid-builder';
import type * as WL from '@wonderlandengine/api';

export interface CuboidMaterialOptions {
    /**
     * The material to use for all of the cube faces, or the cube faces that
     * weren't specified.
     */
    material?: WL.Material;
    /** The material to use for the left (-X) cube face. */
    leftMaterial?: WL.Material;
    /** The material to use for the right (+X) cube face. */
    rightMaterial?: WL.Material;
    /** The material to use for the down (-Y) cube face. */
    downMaterial?: WL.Material;
    /** The material to use for the up (+Y) cube face. */
    upMaterial?: WL.Material;
    /** The material to use for the back (-Z) cube face. */
    backMaterial?: WL.Material;
    /** The material to use for the front (+Z) cube face. */
    frontMaterial?: WL.Material;
}

export interface CuboidOptions extends CuboidMaterialOptions {
    /** The UVs for the left (-X) face. */
    leftUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio;
    /** The UVs for the right (+X) face. */
    rightUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio;
    /** The UVs for the down (-Y) face. */
    downUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio;
    /** The UVs for the up (+Y) face. */
    upUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio;
    /** The UVs for the back (-Z) face. */
    backUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio;
    /** The UVs for the front (+Z) face. */
    frontUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio;
    /**
     * Should the cube be centered? True by default. If true, then the center of
     * mass will be at (0, 0, 0), otherwise one of the corners will be at
     * (0, 0, 0), and another at (widht, height, depth).
     */
    center?: boolean;
}

/**
 * A procedural cuboid with no sub-divisions.
 *
 * @category Procedural Mesh
 */
export class RectangularCuboidMesh extends MeshGroup {
    /**
     * Make a new procedural cuboid.
     *
     * @param engine - The Wonderland Engine instance to use this mesh for
     * @param width - The width of the cuboid.
     * @param height - The height of the cuboid.
     * @param depth - The depth of the cuboid.
     * @param options - Optional arguments for the cuboid generation.
     */
    constructor(engine: WL.WonderlandEngine, width: number, height: number, depth: number, options?: CuboidOptions) {
        super(...makeCuboidBuilder(
            engine, 1, width, height, depth, options?.center ?? true, true,
            options?.leftUVs, options?.rightUVs, options?.downUVs,
            options?.upUVs, options?.backUVs, options?.frontUVs,
        ).finalize(makeCuboidMaterialMap(
            options?.material,
            options?.leftMaterial, options?.rightMaterial,
            options?.downMaterial, options?.upMaterial,
            options?.backMaterial, options?.frontMaterial,
        )));
    }
}