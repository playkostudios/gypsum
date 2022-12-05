import { CuboidMaterialOptions, RectangularCuboidMesh } from './RectangularCuboidMesh';

/**
 * A procedural cube with no sub-divisions.
 *
 * @category Procedural Mesh
 */
export class CubeMesh extends RectangularCuboidMesh {
    /**
     * Make a new cube.
     *
     * @param length - The length of the cube.
     * @param options - Optional arguments for the cube.
     */
    constructor(length: number, options?: CuboidMaterialOptions) {
        super(length, length, length, options);
    }
}