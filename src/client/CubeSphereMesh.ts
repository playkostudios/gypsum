import { makeCuboidBuilder } from './mesh-gen/make-cuboid-builder';
import { MeshGroup } from './MeshGroup';
import { vec3 } from 'gl-matrix';
import { makeCuboidMaterialMap } from './mesh-gen/make-cuboid-material-map';
import { filterHintMap } from './filter-hintmap';

import type { CuboidFaceUVPosRatio, CuboidFaceUVs } from './mesh-gen/make-cuboid-builder';
import type { RadialOptions } from './RadialOptions';
import type { vec2 } from 'gl-matrix';
import type { MeshBuilder } from './mesh-gen/MeshBuilder';
import type { CuboidMaterialOptions } from './RectangularCuboidMesh';
import type { WonderlandEngine } from '../common/backport-shim';

const THIRD = 1 / 3;
const NO_UVS: [vec2, vec2, vec2, vec2] = [[0,0],[0,0],[0,0],[0,0]];

/** Optional arguments for a procedural cube sphere. */
type CubeSphereOptions = RadialOptions & ({
    /**
     * Does the cube sphere have an equirectangular projection? False by
     * default.
     */
    equirectangular: true;
} | {
    /**
     * Does the cube sphere have an equirectangular projection? False by
     * default.
     */
    equirectangular?: false;
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
}) & CuboidMaterialOptions;

function mapCubeToSphere(x: number, y: number, z: number): vec3 {
    // XXX algorithm expects inputs to be in the range -1:1, not -0.5:0.5
    x *= 2;
    y *= 2;
    z *= 2;

    const xSqr = x * x;
    const ySqr = y * y;
    const zSqr = z * z;

    x *= Math.sqrt(1 - 0.5 * (ySqr + zSqr) + ySqr * zSqr * THIRD);
    y *= Math.sqrt(1 - 0.5 * (zSqr + xSqr) + zSqr * xSqr * THIRD);
    z *= Math.sqrt(1 - 0.5 * (xSqr + ySqr) + xSqr * ySqr * THIRD);

    return [x, y, z];
}

export { CubeSphereOptions };

/**
 * A procedural sphere made by spherifying (not by normalizing) a cube.
 *
 * @category Procedural Mesh
 */
export class CubeSphereMesh extends MeshGroup {
    /**
     * Create a new cube sphere. By default, has a radius of 0.5.
     *
     * @param engine - The Wonderland Engine instance to use this mesh for
     * @param options - Optional arguments for the sphere.
     */
    constructor(engine: WonderlandEngine, options?: CubeSphereOptions) {
        const subDivs = options?.subDivisions ?? 12;
        const radius = options?.radius ?? 0.5;
        const diameter = radius * 2;

        let builder: MeshBuilder;
        if (options?.equirectangular) {
            builder = makeCuboidBuilder(
                engine, subDivs, diameter, diameter, diameter, true, false,
                NO_UVS, NO_UVS, NO_UVS, NO_UVS, NO_UVS, NO_UVS,
            );
        } else {
            builder = makeCuboidBuilder(
                engine, subDivs, diameter, diameter, diameter, true, false,
                options?.leftUVs, options?.rightUVs, options?.downUVs,
                options?.upUVs, options?.backUVs, options?.frontUVs,
            );
        }

        builder.warpPositions(mapCubeToSphere);
        builder.normalize();

        if (options?.equirectangular) {
            builder.makeEquirectUVs();
        }

        const hints = filterHintMap(true, true, true, false, options?.hints);
        super(...builder.finalize(
            makeCuboidMaterialMap(
                options?.material,
                options?.leftMaterial, options?.rightMaterial,
                options?.downMaterial, options?.upMaterial,
                options?.backMaterial, options?.frontMaterial,
            ),
            hints
        ));
    }
}