import { vec3 } from 'gl-matrix';
import { EdgeList, ManifoldBuilder } from './ManifoldBuilder';

import type { Triangle } from './Triangle';
import type { vec2 } from 'gl-matrix';
import { Tuple } from '../misc/Tuple';

export type CuboidFaceUVs = [tl: vec2, tr: vec2, bl: vec2, br: vec2];
export type CuboidFaceUVPosRatio = number;
type Quad = [tl: number, tr: number, bl: number, br: number, uvs: CuboidFaceUVs | CuboidFaceUVPosRatio | undefined, uSpan: number, vSpan: number, materialID: number, conEdgeMask: number, conTriMask: number];

function makeUVs(uSpan: number, vSpan: number): [ tl: vec2, tr: vec2, bl: vec2, br: vec2] {
    return [ [0, vSpan], [uSpan, vSpan], [0, 0], [uSpan, 0] ];
}

function addCubeFace(builder: ManifoldBuilder, edgeList: EdgeList, connectableTriangles: Array<Triangle>, corners: Array<vec3>, quad: Quad, addTangents: boolean, subDivisions: number): WL.Mesh {
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

export function makeCuboidBuilder(subDivisions: number, width: number, height: number, depth: number, center: boolean, addTangents = true, leftUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio, rightUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio, downUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio, upUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio, backUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio, frontUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio): ManifoldBuilder {
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
    const builder = new ManifoldBuilder();
    for (const face of faces) {
        addCubeFace(builder, edgeList, connectableTriangles, corners, face, addTangents, subDivisions);
    }

    // auto-connect triangles; edges inside quad are already connected, but
    // not between the quads
    builder.autoConnectEdges(edgeList, connectableTriangles);

    return builder;
}