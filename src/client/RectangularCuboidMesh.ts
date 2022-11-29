import { BaseManifoldWLMesh, SubmeshMap } from './BaseManifoldWLMesh';
import { vec3 } from 'gl-matrix';

import type { vec2 } from 'gl-matrix';
import { StrippedMesh } from '../common/StrippedMesh';

export type CuboidFaceUVs = [tl: vec2, bl: vec2, br: vec2, tr: vec2];
export type CuboidFaceUVPosRatio = number;

export interface CuboidMaterialOptions {
    leftMaterial?: WL.Material;
    rightMaterial?: WL.Material;
    downMaterial?: WL.Material;
    upMaterial?: WL.Material;
    backMaterial?: WL.Material;
    frontMaterial?: WL.Material;
}

export interface CuboidOptions extends CuboidMaterialOptions {
    leftUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio;
    rightUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio;
    downUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio;
    upUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio;
    backUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio;
    frontUVs?: CuboidFaceUVs | CuboidFaceUVPosRatio;
    center?: boolean;
}

type Quad = [tl: number, bl: number, br: number, tr: number];

function makeUVs(uSpan: number, vSpan: number): [ tl: vec2, bl: vec2, br: vec2, tr: vec2] {
    // tl, bl, br, tr
    return [ [0, vSpan], [0, 0], [uSpan, 0], [uSpan, vSpan] ];
}

function makeMesh(quad: Quad, vertPos: Float32Array, normal: vec3, uvs: CuboidFaceUVs | CuboidFaceUVPosRatio | undefined, uSpan: number, vSpan: number, wlMeshOpts: { vertexCount: number, indexData: Uint8Array, indexType: WL.MeshIndexType }): WL.Mesh {
    // make mesh
    const mesh = new WL.Mesh(wlMeshOpts);

    const positions = mesh.attribute(WL.MeshAttribute.Position);
    if (!positions) {
        throw new Error('Could not get position MeshAttributeAccessor');
    }

    const normals = mesh.attribute(WL.MeshAttribute.Normal);
    const texCoords = mesh.attribute(WL.MeshAttribute.TextureCoordinate);

    // resolve actual uv values
    let finalUVs: CuboidFaceUVs | undefined = undefined;
    if (texCoords) {
        if (uvs) {
            if (typeof uvs === 'number') {
                finalUVs = makeUVs(uSpan * uvs, vSpan * uvs);
            } else {
                finalUVs = uvs;
            }
        } else {
            finalUVs = makeUVs(uSpan, vSpan);
        }
    }

    // populate mesh vertex data
    const quad0Offset = quad[0] * 3;
    positions.set(0, vertPos.slice(quad0Offset, quad0Offset + 3));
    const quad1Offset = quad[1] * 3;
    positions.set(1, vertPos.slice(quad1Offset, quad1Offset + 3));
    const quad2Offset = quad[2] * 3;
    positions.set(2, vertPos.slice(quad2Offset, quad2Offset + 3));
    const quad3Offset = quad[3] * 3;
    positions.set(3, vertPos.slice(quad3Offset, quad3Offset + 3));

    if (normals) {
        normals.set(0, normal);
        normals.set(1, normal);
        normals.set(2, normal);
        normals.set(3, normal);
    }

    if (texCoords) {
        texCoords.set(0, [
            ...(finalUVs as CuboidFaceUVs)[0],
            ...(finalUVs as CuboidFaceUVs)[1],
            ...(finalUVs as CuboidFaceUVs)[2],
            ...(finalUVs as CuboidFaceUVs)[3]
        ]);
    }

    return mesh;
}

function trisFromQuads(triVerts: Uint32Array, quadIndices: Array<Quad>) {
    // bottom-left tri, then top-right tri
    // triVerts is assumed to have pre-allocated enough size
    const quadCount = quadIndices.length;
    for (let i = 0, j = 0; i < quadCount; i++) {
        const quad = quadIndices[i];
        triVerts[j++] = quad[0];
        triVerts[j++] = quad[1];
        triVerts[j++] = quad[2];
        triVerts[j++] = quad[0];
        triVerts[j++] = quad[2];
        triVerts[j++] = quad[3];
    }
}

export class RectangularCuboidMesh extends BaseManifoldWLMesh {
    public readonly width: number;
    public readonly height: number;
    public readonly depth: number;

    constructor(width: number, height: number, depth: number, options?: CuboidOptions) {

        // index array with single face
        const indexType = WL.MeshIndexType.UnsignedByte;
        const indexData = new Uint8Array(6);
        indexData[0] = 0;
        indexData[1] = 1;
        indexData[2] = 2;
        indexData[3] = 0;
        indexData[4] = 2;
        indexData[5] = 3;

        // make manifold mesh
        const center = options?.center ?? true;
        const left = center ? (-width / 2) : 0;
        const right = center ? (width / 2) : width;
        const down = center ? (-height / 2) : 0;
        const up = center ? (height / 2) : height;
        const back = center ? (-depth / 2) : 0;
        const front = center ? (depth / 2) : depth;

        const vertPos = new Float32Array([
            left, down, back,
            right, down, back,
            left, up, back,
            right, up, back,
            left, down, front,
            right, down, front,
            left, up, front,
            right, up, front,
        ]);

        // manifold indices for each face in CCW order
        const faceIndices: Array<Quad> = [
            [ 2, 0, 4, 6 ], // left face
            [ 7, 5, 1, 3 ], // right face
            [ 4, 0, 1, 5 ], // down face
            [ 2, 6, 7, 3 ], // up face
            [ 3, 1, 0, 2 ], // back face
            [ 6, 4, 5, 7 ], // front face
        ]

        const triVerts = new Uint32Array(12);
        trisFromQuads(triVerts, faceIndices);

        const manifoldMesh = <StrippedMesh>{ triVerts, vertPos };

        // make submeshes
        const wlMeshOpts = { vertexCount: 4, indexData, indexType };
        const leftMesh = makeMesh(faceIndices[0], vertPos, [-1, 0, 0], options?.leftUVs, depth, height, wlMeshOpts);
        const rightMesh = makeMesh(faceIndices[1], vertPos, [1, 0, 0], options?.rightUVs, depth, height, wlMeshOpts);
        const downMesh = makeMesh(faceIndices[2], vertPos, [0, -1, 0], options?.downUVs, width, depth, wlMeshOpts);
        const upMesh = makeMesh(faceIndices[3], vertPos, [0, 1, 0], options?.upUVs, width, depth, wlMeshOpts);
        const backMesh = makeMesh(faceIndices[4], vertPos, [0, 0, -1], options?.backUVs, width, height, wlMeshOpts);
        const frontMesh = makeMesh(faceIndices[5], vertPos, [0, 0, 1], options?.frontUVs, width, height, wlMeshOpts);

        // make submesh map
        const submeshMap: SubmeshMap = new Uint8Array([
            0, 0, 0, 1, // left plane
            1, 0, 1, 1, // right plane
            2, 0, 2, 1, // down plane
            3, 0, 3, 1, // up plane
            4, 0, 4, 1, // back plane
            5, 0, 5, 1, // front plane
        ]);

        super([
            [ leftMesh, options?.leftMaterial ?? null ],
            [ rightMesh, options?.rightMaterial ?? null ],
            [ downMesh, options?.downMaterial ?? null ],
            [ upMesh, options?.upMaterial ?? null ],
            [ backMesh, options?.backMaterial ?? null ],
            [ frontMesh, options?.frontMaterial ?? null ],
        ], manifoldMesh, submeshMap);

        this.width = width;
        this.height = height;
        this.depth = depth;
    }
}