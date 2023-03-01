import { CuboidMaterialOptions, RectangularCuboidMesh } from './RectangularCuboidMesh';

import type * as WL from '@wonderlandengine/api';
/**
 * A procedural cube with no sub-divisions.
 *
 * @category Procedural Mesh
 */
export class CubeMesh extends RectangularCuboidMesh {
    /**
     * Make a new cube.
     *
     * @param engine - The Wonderland Engine instance to use this mesh for
     * @param length - The length of the cube.
     * @param options - Optional arguments for the cube.
     */
    constructor(engine: WL.WonderlandEngine, length: number, options?: CuboidMaterialOptions) {
        super(engine, length, length, length, options);
    }
}