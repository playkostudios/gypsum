import { vec3 } from 'gl-matrix';
import { MeshBuilder } from './MeshBuilder';
import { Tuple } from '../misc/Tuple';
import { autoConnectEdges } from './auto-connect-edges';

import type { Triangle } from './Triangle';
import type { vec2 } from 'gl-matrix';
import type { EdgeList } from './EdgeList';
import type { WonderlandEngine } from '@wonderlandengine/api';

/**
 * A list of UVs for the corner of a cuboid's face. In order, the top-left
 * corner UVs, top-right corner UVs, bottom-left corner UVs, and bottom-right
 * corner UVs.
 */
export type CuboidFaceUVs = [tl: vec2, tr: vec2, bl: vec2, br: vec2];
/**
 * A world position to UV ratio to use instead of a list of UV coordinates.
 */
export type CuboidFaceUVPosRatio = number;

type Quad = [tl: number, tr: number, bl: number, br: number, uvs: CuboidFaceUVs | CuboidFaceUVPosRatio | undefined, uSpan: number, vSpan: number, materialID: number, conEdgeMask: number, conTriMask: number];

function makeUVs(uSpan: number, vSpan: number): [ tl: vec2, tr: vec2, bl: vec2, br: vec2] {
    return [ [0, vSpan], [uSpan, vSpan], [0, 0], [uSpan, 0] ];
}

function addCubeFace(builder: MeshBuilder, edgeList: EdgeList, connectableTriangles: Array<Triangle>, corners: Array<vec3>, quad: Quad, addTangents: boolean, subDivisions: number): void {
    // resolve actual uv values
    let finalUVs: CuboidFaceUVs | undefined | Tuple<undefined, 4> = undefined;
    const uvs = quad[4];
    if (uvs) {
        if (typeof uvs === 'number') {
            finalUVs = makeUVs(quad[5] * uvs, quad[6] * uvs);
        } else {
            finalUVs = uvs;
        }
    } else {
        finalUVs = makeUVs(quad[5], quad[6]);
    }

    // optimise uvs; if they are all 0, then skip settings uvs
    let areUVsBlank = true;
    for (let i = 0; i < 4; i++) {
        if (finalUVs[i][0] !== 0 || finalUVs[i][1] !== 0) {
            areUVsBlank = false;
            break;
        }
    }

    if (areUVsBlank) {
        finalUVs = [ undefined, undefined, undefined, undefined ];
    }

    // add subdivided quad
    const tlPos = corners[quad[0]];
    const trPos = corners[quad[3]];
    const blPos = corners[quad[1]];
    const brPos = corners[quad[2]];
    builder.addSubdivQuadWithEdges(edgeList, connectableTriangles, quad[8], quad[9], tlPos, trPos, blPos, brPos, quad[7], addTangents, subDivisions, ...finalUVs);
}

/**
 * Create a new MeshBuilder with the triangles and topology of a sub-divided
 * cuboid. Triangle material IDs:
 * 0: left
 * 1: right
 * 2: down
 * 3: up
 * 4: back
 * 5: front
 *
 * @param subDivisions - The amount of sub-divisions per face. For example, 1 sub-division means that there are only 2 triangles per face, but 2 sub-divisions means that there are 8 triangles per face.
 * @param width - The width (X length) of the cuboid.
 * @param height - The height (Y length) of the cuboid.
 * @param depth - The depth (Z length) of the cuboid.
 * @param center - If true, then the cuboid will have its center of mass at (0, 0, 0), otherwise, the cuboid will have a corner at (0, 0, 0), and another corner at (width, height, depth).
 * @param addTangents - If true (default), then tangents will be added to each triangle's vertices. Useful if you want to avoid generating tangents for optimisation purposes.
 * @param leftUVs - UVs for the left (-X) face.
 * @param rightUVs - UVs for the right (+X) face.
 * @param downUVs - UVs for the down (-Y) face.
 * @param upUVs - UVs for the up (+Y) face.
 * @param backUVs - UVs for the back (-Z) face.
 * @param frontUVs - UVs for the front (+Z) face.
 * @returns A new MeshBuilder instance with the triangles and topology of a sub-divided cuboid.
 */
export function makeCuboidBuilder(engine: WonderlandEngine, subDivisions: number, width: number, height: number, depth: number, center: boolean, addTangents = true, leftUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio, rightUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio, downUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio, upUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio, backUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio, frontUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio): MeshBuilder {
    // make corners
    const right = center ? (width / 2) : width;
    const left = center ? -right : 0;
    const up = center ? (height / 2) : height;
    const down = center ? -up : 0;
    const front = center ? (depth / 2) : depth;
    const back = center ? -front : 0;

    const corners = new Array<vec3>(
        vec3.fromValues(left, down, back),
        vec3.fromValues(right, down, back),
        vec3.fromValues(left, up, back),
        vec3.fromValues(right, up, back),
        vec3.fromValues(left, down, front),
        vec3.fromValues(right, down, front),
        vec3.fromValues(left, up, front),
        vec3.fromValues(right, up, front),
    );

    // make faces
    const faces: Array<Quad> = [
        [ 2, 0, 4, 6, leftUVs , depth, height, 0, 0b1111, 0b0000 ], // left
        [ 7, 5, 1, 3, rightUVs, depth, height, 1, 0b1111, 0b0000 ], // right
        [ 4, 0, 1, 5, downUVs , width, depth , 2, 0b0000, 0b1111 ], // down
        [ 2, 6, 7, 3, upUVs   , width, depth , 3, 0b0000, 0b1111 ], // up
        [ 3, 1, 0, 2, backUVs , width, height, 4, 0b0011, 0b1100 ], // back
        [ 6, 4, 5, 7, frontUVs, width, height, 5, 0b0011, 0b1100 ], // front
    ];

    // add faces
    const edgeList: EdgeList = [];
    const connectableTriangles: Array<Triangle> = [];
    const builder = new MeshBuilder(engine);
    for (const face of faces) {
        addCubeFace(builder, edgeList, connectableTriangles, corners, face, addTangents, subDivisions);
    }

    // auto-connect triangles; edges inside quad are already connected, but
    // not between the quads
    autoConnectEdges(edgeList, connectableTriangles);

    return builder;
}