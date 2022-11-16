import { CuboidMaterialOptions, RectangularCuboidMesh } from './RectangularCuboidMesh';

export class CubeMesh extends RectangularCuboidMesh {
    constructor(length: number, options?: CuboidMaterialOptions) {
        super(length, length, length, options);
    }
}