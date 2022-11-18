// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../types/globals.d.ts" />

import { mat3, mat4, vec2, vec3 } from 'gl-matrix';
import { BaseManifoldWLMesh, Submesh, SubmeshMap } from './BaseManifoldWLMesh';
import triangulate2DPolygon from './triangulation/triangulate-2d-polygon';
import internalCtorKey from './mesh-gen/internal-ctor-key';
import type { CurveFrames } from './rmf/curve-frame';

type InternalCtorArgs = [ctorKey: symbol, submeshes: Array<Submesh>, premadeManifoldMesh: Mesh | undefined, submeshMap: SubmeshMap | undefined];

const temp0 = vec3.create();

type SegmentsUVs = [startV: number, endV: number, segmentsUs: Array<number>];

export interface ExtrusionMaterialOptions {
    startMaterial?: WL.Material;
    endMaterial?: WL.Material;
    segmentMaterial?: WL.Material;
}

export interface ExtrusionOptions extends ExtrusionMaterialOptions {
    smoothNormals?: boolean;
    startBaseUVs?: Array<vec2>;
    endBaseUVs?: Array<vec2>;
    segmentsUVs?: [startV: number | null, endV: number | null, segmentsUs: Array<number> | null];
    curveScales?: Array<number>;
}

function getMatrix(outputMat: mat4, index: number, frames: CurveFrames, positions: Array<vec3>, scales: Array<number> | null) {
    // r (normal) = +y, s (binormal) = +x, t (tangent) = +z
    // make matrix from position and frame
    const [r, s, t] = frames[index];
    const position = positions[index];
    const scale = scales ? scales[index] : 1;

    mat4.set(
        outputMat,
        scale * s[0], scale * s[1], scale * s[2], 0,
        scale * r[0], scale * r[1], scale * r[2], 0,
        scale * t[0], scale * t[1], scale * t[2], 0,
        position[0], position[1], position[2], 1
    );
}

export class ExtrusionMesh extends BaseManifoldWLMesh {
    constructor(internalCtorArgs: InternalCtorArgs);
    constructor(polyline: Array<vec2>, curvePositions: Array<vec3>, curveFrames: CurveFrames, options?: ExtrusionOptions);
    constructor(arg0: Array<vec2> | InternalCtorArgs, arg1?: Array<vec3>, arg2?: CurveFrames, arg3?: ExtrusionOptions) {
        if (arguments.length === 1 && Array.isArray(arg0) && arg0.length === 4 && arg0[0] === internalCtorKey) {
            // internal constructor. not for public use. implemented this way
            // because typescript doesn't support multiple constructors
            const internalCtorArgs = arg0 as InternalCtorArgs;
            super(internalCtorArgs[1], internalCtorArgs[2], internalCtorArgs[3]);
            return;
        } else if (arguments.length !== 3 && arguments.length !== 4) {
            throw new Error('Unexpected number of arguments. Expected 3 or 4 arguments');
        }

        const polyline = arg0 as Array<vec2>;
        const curvePositions = arg1 as Array<vec3>;
        const curveFrames = arg2 as CurveFrames;
        const options = arg3 as ExtrusionOptions;

        // validate curve
        const pointCount = curvePositions.length;
        const loopLen = polyline.length;

        if (curveFrames.length !== pointCount) {
            throw new Error('There must be at least one frame per point');
        }

        if (pointCount < 2) {
            throw new Error('There must be at least 1 segment (2 points) in the curve');
        }

        if (loopLen < 3) {
            throw new Error('There must be at least 3 points in the polyline');
        }

        // validate base UVs
        const startBaseUVs: Array<vec2> | null = options?.startBaseUVs ?? null;
        if (startBaseUVs && startBaseUVs.length !== loopLen) {
            throw new Error('Start base UV count must match polyline length');
        }

        const endBaseUVs: Array<vec2> | null = options?.endBaseUVs ?? null;
        if (endBaseUVs && endBaseUVs.length !== loopLen) {
            throw new Error('End base UV count must match polyline length');
        }

        // validate curve scales
        const curveScales: Array<number> | null = options?.curveScales ?? null;
        if (curveScales && curveScales.length !== pointCount) {
            throw new Error('There must be exactly one scale per point when curve scales are specified');
        }

        // validate segment UVs
        let needsExtraPoint = false;
        let segmentsUVs: SegmentsUVs | null = null;
        const inputSegmentsUVs = options?.segmentsUVs;
        if (inputSegmentsUVs) {
            let inputSegmentsUs = inputSegmentsUVs[2];

            if (inputSegmentsUs) {
                if (inputSegmentsUs.length !== loopLen && inputSegmentsUs.length !== loopLen + 1) {
                    throw new Error('Segments U count must match polyline length, or have 1 more for the wrap-around value');
                }
            } else {
                inputSegmentsUs = new Array(loopLen + 1);
                for (let i = 0; i <= loopLen; i++) {
                    inputSegmentsUs[i] = i / loopLen;
                }
            }

            needsExtraPoint = inputSegmentsUs.length === (loopLen + 1);

            segmentsUVs = [
                inputSegmentsUVs[0] ?? 0,
                inputSegmentsUVs[1] ?? 1,
                inputSegmentsUs,
            ];
        }

        // triangulate base
        const triangulatedBase = triangulate2DPolygon(polyline);
        const triangulatedBaseLen = triangulatedBase.length;

        // calculate vertex count and prepare index data (wle and manifold)
        const hasSmoothNormals = options?.smoothNormals ?? false;
        const manifVertexCount = loopLen * pointCount;
        let segVertexCount = manifVertexCount;

        if (hasSmoothNormals) {
            segVertexCount += pointCount;
        } else {
            segVertexCount *= 2;
        }

        const segmentCount = pointCount - 1;
        const baseTriCount = triangulatedBaseLen / 3;
        const segmentsTriCount = segmentCount * loopLen * 2;
        const manifTriCount = 2 * baseTriCount + segmentsTriCount;

        const [indexDataStart, indexTypeStart] = BaseManifoldWLMesh.makeIndexBuffer(triangulatedBaseLen);
        const [indexDataEnd, indexTypeEnd] = BaseManifoldWLMesh.makeIndexBuffer(triangulatedBaseLen);
        const [indexDataSeg, indexTypeSeg] = BaseManifoldWLMesh.makeIndexBuffer(loopLen * segmentCount * 6);

        // manifold mesh output
        const manifTriVerts = new Array<Vec3>(manifTriCount);
        const manifVertPos = new Array<Vec3>(manifVertexCount);

        // populate indexData
        // vertex data is not yet populated, but the order will be:
        // - start base polyline vertices
        // - segment 1 vertices (2x if hasSmoothNormals is false, +1 if needsExtraPoint and hasSmoothNormals are true)
        // - ...
        // - segment [segmentCount] vertices (2x if hasSmoothNormals is false, +1 if needsExtraPoint and hasSmoothNormals are true)
        // - end base polyline vertices

        // the equivalent vertex data for manifold will be:
        // - segment 1 vertices (always as if hasSmoothNormals is true)
        // - ...
        // - segment [segmentCount] vertices (always as if hasSmoothNormals is true)

        // starting base indices
        // (wle)
        indexDataStart.set(triangulatedBase);
        // (manifold)
        let manifTri = 0;
        const lLast = loopLen - 1;
        for (let i = 0; i < triangulatedBaseLen;) {
            // XXX manifold reuses segment positions, so the indices need to be
            // corrected to take the winding order of the polyline into account
            manifTriVerts[manifTri++] = [
                lLast - triangulatedBase[i++],
                lLast - triangulatedBase[i++],
                lLast - triangulatedBase[i++],
            ];
        }

        // segment indices
        let segmentStride = loopLen;
        if (!hasSmoothNormals) {
            segmentStride *= 2;
        }

        let segmentStrideExtra = segmentStride;
        if (hasSmoothNormals && needsExtraPoint) {
            segmentStrideExtra++;
        }

        let segmentStart = 0;
        let segmentEnd = segmentStrideExtra;
        let manifSegmentStart = 0;
        let manifSegmentEnd = loopLen;

        let i = 0;
        for (let s = 0; s < segmentCount; s++) {
            // (wle)
            if (hasSmoothNormals) {
                for (let l = 0; l < segmentStride; l++) {
                    const blIdx = segmentStart + l;
                    const trIdx = segmentEnd + (l + 1) % segmentStrideExtra;

                    // bottom-right triangle
                    indexDataSeg[i++] = blIdx;
                    indexDataSeg[i++] = segmentStart + (l + 1) % segmentStrideExtra;
                    indexDataSeg[i++] = trIdx;

                    // top-left triangle
                    indexDataSeg[i++] = blIdx;
                    indexDataSeg[i++] = trIdx;
                    indexDataSeg[i++] = segmentEnd + l;
                }
            } else {
                for (let l = 0; l < segmentStride; l += 2) {
                    const blIdx = segmentStart + l;
                    const tlIdx = segmentEnd + l;
                    const trIdx = tlIdx + 1;

                    // bottom-right triangle
                    indexDataSeg[i++] = blIdx;
                    indexDataSeg[i++] = blIdx + 1;
                    indexDataSeg[i++] = trIdx;

                    // top-left triangle
                    indexDataSeg[i++] = blIdx;
                    indexDataSeg[i++] = trIdx;
                    indexDataSeg[i++] = tlIdx;
                }
            }

            segmentStart += segmentStrideExtra;
            segmentEnd += segmentStrideExtra;

            // (manifold)
            for (let l = 0; l < loopLen; l++) {
                const blIdx = manifSegmentStart + l;
                const trIdx = manifSegmentEnd + (l + 1) % loopLen;

                // bottom-right triangle
                manifTriVerts[manifTri++] = [
                    blIdx,
                    manifSegmentStart + (l + 1) % loopLen,
                    trIdx,
                ];

                // top-left triangle
                manifTriVerts[manifTri++] = [
                    blIdx,
                    trIdx,
                    manifSegmentEnd + l,
                ];
            }

            manifSegmentStart += loopLen;
            manifSegmentEnd += loopLen;
        }

        // ending base indices
        for (let j = 0, endWLEIdx = 0; j < triangulatedBaseLen;) {
            // XXX winding order needs to be flipped since the end base is in
            // the opposite direction (ish) of the start base
            const c = triangulatedBase[j++];
            const b = triangulatedBase[j++];
            const a = triangulatedBase[j++];

            // (wle)
            indexDataEnd[endWLEIdx++] = a;
            indexDataEnd[endWLEIdx++] = b;
            indexDataEnd[endWLEIdx++] = c;

            // XXX manifold reuses segment positions, so the indices need to be
            // corrected to take the winding order of the polyline into account
            manifTriVerts[manifTri++] = [
                lLast - a + manifSegmentStart,
                lLast - b + manifSegmentStart,
                lLast - c + manifSegmentStart,
            ];
        }

        // construct parent class
        const startMesh = new WL.Mesh({ vertexCount: loopLen, indexData: indexDataStart, indexType: indexTypeStart });
        const segMesh = new WL.Mesh({ vertexCount: segVertexCount, indexData: indexDataSeg, indexType: indexTypeSeg });
        const endMesh = new WL.Mesh({ vertexCount: loopLen, indexData: indexDataEnd, indexType: indexTypeEnd });

        super([
            [ startMesh, options?.startMaterial ?? null ], // start base
            [ segMesh, options?.segmentMaterial ?? null ], // segments
            [ endMesh, options?.endMaterial ?? null ], // end base
        ], <Mesh>{
            triVerts: manifTriVerts,
            vertPos: manifVertPos,
        });

        // get mesh accessors
        // (start base)
        const baseBufLen = loopLen * 3;
        const startPositions = startMesh.attribute(WL.MeshAttribute.Position);
        if (!startPositions) {
            throw new Error('Could not get position mesh attribute accessor (start base mesh)');
        }
        const startPosBuf = new Float32Array(baseBufLen);

        const startNormals = startMesh.attribute(WL.MeshAttribute.Normal);
        let startNormBuf: Float32Array | null = null;
        if (startNormals) {
            startNormBuf = new Float32Array(baseBufLen);
        }

        const baseTexCoordBufLen = loopLen * 2;
        let startTexCoords: WL.MeshAttributeAccessor | null;
        let startTexCoordBuf: Float32Array | null = null;
        if (startBaseUVs) {
            startTexCoords = startMesh.attribute(WL.MeshAttribute.TextureCoordinate);
            if (startTexCoords) {
                startTexCoordBuf = new Float32Array(baseTexCoordBufLen);
            } else {
                console.warn('Start base UVs ignored; texture coordinate mesh attribute not available');
            }
        }

        // (segments)
        const segBufLen = pointCount * segmentStrideExtra * 3;
        const segPositions = segMesh.attribute(WL.MeshAttribute.Position);
        if (!segPositions) {
            throw new Error('Could not get position mesh attribute accessor (end base mesh)');
        }
        const segPosBuf = new Float32Array(segBufLen);

        const segNormals = segMesh.attribute(WL.MeshAttribute.Normal);
        let segNormBuf: Float32Array | null = null;
        if (segNormals) {
            segNormBuf = new Float32Array(segBufLen);
        }

        let segTexCoords: WL.MeshAttributeAccessor | null;
        let segTexCoordBuf: Float32Array | null = null;
        if (segmentsUVs) {
            segTexCoords = segMesh.attribute(WL.MeshAttribute.TextureCoordinate);
            if (segTexCoords) {
                segTexCoordBuf = new Float32Array(pointCount * segmentStrideExtra * 2);
            } else {
                console.warn('End base UVs ignored; texture coordinate mesh attribute not available');
            }
        }

        // (end base)
        const endPositions = endMesh.attribute(WL.MeshAttribute.Position);
        if (!endPositions) {
            throw new Error('Could not get position mesh attribute accessor (end base mesh)');
        }
        const endPosBuf = new Float32Array(baseBufLen);

        const endNormals = endMesh.attribute(WL.MeshAttribute.Normal);
        let endNormBuf: Float32Array | null = null;
        if (endNormals) {
            endNormBuf = new Float32Array(baseBufLen);
        }

        let endTexCoords: WL.MeshAttributeAccessor | null;
        let endTexCoordBuf: Float32Array | null = null;
        if (endBaseUVs) {
            endTexCoords = endMesh.attribute(WL.MeshAttribute.TextureCoordinate);
            if (endTexCoords) {
                endTexCoordBuf = new Float32Array(baseTexCoordBufLen);
            } else {
                console.warn('End base UVs ignored; texture coordinate mesh attribute not available');
            }
        }

        const hasVertexNormals = startNormBuf || endNormBuf || segNormBuf;

        // make submesh map
        // 0: startMesh
        // 1: segMesh
        // 2: endMesh
        const submeshMap: SubmeshMap = new Float32Array(manifTriCount * 2);

        i = 0;
        const jEndOffset = (baseTriCount + segmentsTriCount) * 2;
        for (let j = 0; i < triangulatedBaseLen; i++) {
            // start and end bases submesh indices
            submeshMap[j] = 0
            submeshMap[jEndOffset + j++] = 2;
            // start and end bases triangle indices
            submeshMap[j] = i;
            submeshMap[jEndOffset + j++] = i;
        }

        i = 0;
        for (let j = baseTriCount * 2; i < segmentsTriCount; i++) {
            // segment triangle indices
            submeshMap[j++] = 1;
            submeshMap[j++] = i;
        }

        this.submeshMap = submeshMap;

        // pre-calculate untransformed normals of each edge in the polyline, and
        // smooth normals for each vertex, if smooth normals are enabled
        let edgeNormals: Array<vec3> | null = null;
        let smoothNormals: Array<vec3> | null = null;

        if (hasVertexNormals) {
            edgeNormals = new Array(loopLen);

            if (hasSmoothNormals) {
                smoothNormals = new Array(loopLen);
            }

            // first edge normal
            vec3.set(temp0, 0, 0, -1);
            const lXYLast = polyline[0];
            const mXYLast = polyline[lLast];
            const lastEdgeNormal = vec3.fromValues(lXYLast[0] - mXYLast[0], lXYLast[1] - mXYLast[1], 0);
            edgeNormals[lLast] = vec3.cross(lastEdgeNormal, temp0, lastEdgeNormal);

            // other edge normals + smooth normals
            for (let l = 0; l < lLast; l++) {
                const m = l + 1;
                const lXY = polyline[lLast - l];
                const mXY = polyline[lLast - m];
                const edgeNormal = vec3.fromValues(lXY[0] - mXY[0], lXY[1] - mXY[1], 0);
                edgeNormals[l] = vec3.cross(edgeNormal, temp0, edgeNormal);

                if (smoothNormals) {
                    const lastEdge = l === 0 ? lLast : (l - 1);
                    const prevEdgeNormal = edgeNormals[lastEdge];
                    const smoothNormal = vec3.add(vec3.create(), prevEdgeNormal, edgeNormal);
                    vec3.normalize(smoothNormal, smoothNormal);
                    smoothNormals[l] = smoothNormal;
                }
            }

            // last smooth vertex normal
            if (smoothNormals) {
                const lastSmoothNormal = vec3.add(vec3.create(), edgeNormals[lLast - 1], edgeNormals[lLast]);
                vec3.normalize(lastSmoothNormal, lastSmoothNormal);
                smoothNormals[lLast] = lastSmoothNormal;
            }
        }

        // pre-calculate segment positions. vertex positions for manifold are
        // populated this way. also pre-calculate extrusion length
        const matrix = mat4.create();
        let extrusionLength = 0;

        i = 0;
        for (let p = 0; p < pointCount; p++) {
            getMatrix(matrix, p, curveFrames, curvePositions, curveScales);

            if (p > 0) {
                extrusionLength += vec3.distance(curvePositions[p], curvePositions[p - 1]);
            }

            for (let l = 0; l < loopLen; l++) {
                const xy = polyline[lLast - l];
                const pos = vec3.fromValues(xy[0], xy[1], 0) as Vec3;
                vec3.transformMat4(pos, pos, matrix);
                manifVertPos[i++] = pos;
            }
        }

        // make start base vertices
        getMatrix(matrix, 0, curveFrames, curvePositions, curveScales);
        const startNormal = vec3.clone(curveFrames[0][2]); // [2] = t = curve tangent
        vec3.negate(startNormal, startNormal);

        i = 0;
        let uv = 0;
        for (let l = 0; l < loopLen; l++) {
            startPosBuf.set(manifVertPos[lLast - l], i);

            if (startNormBuf) {
                startNormBuf.set(startNormal, i);
            }
            if (startTexCoordBuf) {
                startTexCoordBuf.set((startBaseUVs as Array<vec2>)[l], uv);
                uv += 2;
            }

            i += 3;
        }

        // make segment vertices
        const normalMatrix = mat3.create();

        i = 0;
        let curLength = 0, iTexCoord = 0, vRange = 0;

        if (segmentsUVs) {
            vRange = segmentsUVs[1] - segmentsUVs[0];
        }

        for (let p = 0; p < pointCount; p++) {
            getMatrix(matrix, p, curveFrames, curvePositions, curveScales);
            const lOffset = p * loopLen;

            if (p > 0) {
                curLength += vec3.distance(curvePositions[p], curvePositions[p - 1]);
            }

            if (segNormBuf) {
                // XXX don't use normalFromMat4 or you will always get identity matrices
                mat3.fromMat4(normalMatrix, matrix);
            }

            for (let l = 0; l < loopLen; l++) {
                segPosBuf.set(manifVertPos[l + lOffset], i);

                if (smoothNormals) {
                    if (segNormBuf) {
                        vec3.transformMat3(temp0, smoothNormals[l], normalMatrix);
                        segNormBuf.set(temp0, i);
                    }
                    if (segTexCoordBuf) {
                        const u = (segmentsUVs as SegmentsUVs)[2][l];
                        const v = vRange * curLength / extrusionLength;
                        segTexCoordBuf.set([u, v], iTexCoord);
                        iTexCoord += 2;
                    }
                } else {
                    if (segNormBuf) {
                        vec3.transformMat3(temp0, (edgeNormals as Array<vec3>)[l], normalMatrix);
                        segNormBuf.set(temp0, i);
                        segNormBuf.set(temp0, i + 3);
                    }
                    if (segTexCoordBuf) {
                        const u1 = (segmentsUVs as SegmentsUVs)[2][l];
                        let u2: number;

                        if (needsExtraPoint) {
                            u2 = (segmentsUVs as SegmentsUVs)[2][l + 1];
                        } else {
                            u2 = (segmentsUVs as SegmentsUVs)[2][(l + 1) % loopLen];
                        }

                        const v = vRange * curLength / extrusionLength;
                        segTexCoordBuf.set([u1, v, u2, v], iTexCoord);
                        iTexCoord += 4;
                    }

                    i += 3;

                    segPosBuf.set(manifVertPos[(l + 1) % loopLen + lOffset], i);
                }

                i += 3;
            }

            // add extra point for segment if needed
            if (smoothNormals && needsExtraPoint) {
                segPosBuf.set(manifVertPos[lOffset], i);

                if (segNormBuf) {
                    vec3.transformMat3(temp0, smoothNormals[0], normalMatrix);
                    segNormBuf.set(temp0, i);
                }
                if (segTexCoordBuf) {
                    const u = (segmentsUVs as SegmentsUVs)[2][loopLen];
                    const v = vRange * curLength / extrusionLength;
                    segTexCoordBuf.set([u, v], iTexCoord);
                    iTexCoord += 2;
                }

                i += 3;
            }
        }

        // make end base vertices
        getMatrix(matrix, segmentCount, curveFrames, curvePositions, curveScales);
        const endNormal = curveFrames[segmentCount][2]; // [2] = t = curve tangent
        const lEndOffset = segmentCount * loopLen;

        i = 0, uv = 0;
        for (let l = 0; l < loopLen; l++) {
            endPosBuf.set(manifVertPos[lEndOffset + lLast - l], i);

            if (endNormBuf) {
                endNormBuf.set(endNormal, i);
            }
            if (endTexCoordBuf) {
                endTexCoordBuf.set((endBaseUVs as Array<vec2>)[l], uv);
                uv += 2;
            }

            i += 3;
        }

        // upload vertex attributes
        // (start base)
        startPositions.set(0, startPosBuf);

        if (startNormBuf) {
            (startNormals as WL.MeshAttributeAccessor).set(0, startNormBuf);
        }
        if (startTexCoordBuf) {
            (startTexCoords as WL.MeshAttributeAccessor).set(0, startTexCoordBuf);
        }

        // (segments)
        segPositions.set(0, segPosBuf);

        if (segNormBuf) {
            (segNormals as WL.MeshAttributeAccessor).set(0, segNormBuf);
        }
        if (segTexCoordBuf) {
            (segTexCoords as WL.MeshAttributeAccessor).set(0, segTexCoordBuf);
        }

        // (end base)
        endPositions.set(0, endPosBuf);

        if (endNormBuf) {
            (endNormals as WL.MeshAttributeAccessor).set(0, endNormBuf);
        }
        if (endTexCoordBuf) {
            (endTexCoords as WL.MeshAttributeAccessor).set(0, endTexCoordBuf);
        }
    }

    clone(materials?: ExtrusionMaterialOptions): ExtrusionMesh {
        return new ExtrusionMesh(<InternalCtorArgs>[
            internalCtorKey,
            [
                [ this.submeshes[0][0], materials?.startMaterial ?? null ],
                [ this.submeshes[1][0], materials?.segmentMaterial ?? null ],
                [ this.submeshes[2][0], materials?.endMaterial ?? null ]
            ],
            this.premadeManifoldMesh,
            this.submeshMap
        ]);
    }
}