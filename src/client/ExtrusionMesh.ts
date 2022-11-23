// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../types/globals.d.ts" />

import { mat3, mat4, vec2, vec3 } from 'gl-matrix';
import { BaseManifoldWLMesh, Submesh, SubmeshMap } from './BaseManifoldWLMesh';
import triangulate2DPolygon from './triangulation/triangulate-2d-polygon';
import internalCtorKey from './mesh-gen/internal-ctor-key';
import type { CurveFrames } from './rmf/curve-frame';
import { normalFromTriangle } from './mesh-gen/normal-from-triangle';

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

        const [indexDataStart, indexTypeStart] = BaseManifoldWLMesh.makeIndexBuffer(triangulatedBaseLen, loopLen);
        const [indexDataEnd, indexTypeEnd] = BaseManifoldWLMesh.makeIndexBuffer(triangulatedBaseLen, loopLen);
        const [indexDataSeg, indexTypeSeg] = BaseManifoldWLMesh.makeIndexBuffer(loopLen * segmentCount * 6, segVertexCount);

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

        for (let s = 0, i = 0; s < segmentCount; s++) {
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

        const jEndOffset = (baseTriCount + segmentsTriCount) * 2;
        for (let i = 0, j = 0; i < triangulatedBaseLen; i++) {
            // start and end bases submesh indices
            submeshMap[j] = 0
            submeshMap[jEndOffset + j++] = 2;
            // start and end bases triangle indices
            submeshMap[j] = i;
            submeshMap[jEndOffset + j++] = i;
        }

        for (let i = 0, j = baseTriCount * 2; i < segmentsTriCount; i++) {
            // segment triangle indices
            submeshMap[j++] = 1;
            submeshMap[j++] = i;
        }

        this.submeshMap = submeshMap;

        // pre-calculate segment positions. vertex positions for manifold are
        // populated this way. also pre-calculate extrusion length
        const matrix = mat4.create();
        let extrusionLength = 0;

        for (let i = 0, p = 0; p < pointCount; p++) {
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

        // pre-calculate transformed normals of each edge in the polyline, and
        // smooth normals for each vertex, if smooth normals are enabled. vertex
        // normals are pre-calculated because they are shared in some cases
        let edgeNormals: Array<vec3> | null = null;
        let smoothNormals: Array<vec3> | null = null;

        if (hasVertexNormals) {
            // calculate edge normals from one of the triangles in a segment
            edgeNormals = new Array(loopLen * segmentCount);

            for (let i = 0, s = 0; s < segmentCount; s++) {
                for (let l = 0; l < loopLen; l++) {
                    edgeNormals[i] = normalFromTriangle(
                        manifVertPos[i],
                        manifVertPos[i + 1],
                        manifVertPos[i + loopLen],
                        vec3.create(),
                    );
                    i++;
                }
            }

            // calculate smooth vertex normals by getting the average of the
            // normals of all triangles touching a vertex
            // XXX note that there is probably no need to do weighted vertex
            // normals (http://www.bytehazard.com/articles/vertnorm.html)
            // because we are only getting the face normals of 2 triangles per
            // segment, where both are pointing at different directions
            if (hasSmoothNormals) {
                smoothNormals = new Array(loopLen * pointCount);

                for (let i = 0, p = 0; p < pointCount; p++) {
                    const lOffset = p * loopLen;

                    for (let l = 0; l < loopLen; l++) {
                        const smoothNormal = vec3.create();

                        if (p > 0) {
                            // normals from previous segment
                            const prevStart = lOffset - loopLen;
                            vec3.add(smoothNormal, smoothNormal, edgeNormals[prevStart + l]);
                            vec3.add(smoothNormal, smoothNormal, edgeNormals[prevStart + (l - 1 + loopLen) % loopLen]);
                        }

                        if (p < segmentCount) {
                            // normals from next segment
                            vec3.add(smoothNormal, smoothNormal, edgeNormals[lOffset + l]);
                            vec3.add(smoothNormal, smoothNormal, edgeNormals[lOffset + (l - 1 + loopLen) % loopLen]);
                        }

                        smoothNormals[i] = vec3.normalize(smoothNormal, smoothNormal);
                        i++;
                    }
                }
            }
        }

        // make start base vertices
        getMatrix(matrix, 0, curveFrames, curvePositions, curveScales);
        const startNormal = vec3.clone(curveFrames[0][2]); // [2] = t = curve tangent
        vec3.negate(startNormal, startNormal);

        for (let i = 0, l = 0, uv = 0; l < loopLen; l++) {
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
        let curLength = 0, iTexCoord = 0, vRange = 0;

        if (segmentsUVs) {
            vRange = segmentsUVs[1] - segmentsUVs[0];
        }

        for (let i = 0, p = 0; p < pointCount; p++) {
            getMatrix(matrix, p, curveFrames, curvePositions, curveScales);
            const lOffset = p * loopLen;

            if (p > 0) {
                curLength += vec3.distance(curvePositions[p], curvePositions[p - 1]);
            }

            for (let l = 0; l < loopLen; l++) {
                segPosBuf.set(manifVertPos[l + lOffset], i);

                if (smoothNormals) {
                    if (segNormBuf) {
                        segNormBuf.set(smoothNormals[lOffset + l], i);
                    }
                    if (segTexCoordBuf) {
                        const u = (segmentsUVs as SegmentsUVs)[2][l];
                        const v = vRange * curLength / extrusionLength;
                        segTexCoordBuf.set([u, v], iTexCoord);
                        iTexCoord += 2;
                    }
                } else {
                    if (segNormBuf) {
                        const edgeNormal = (edgeNormals as Array<vec3>)[Math.min(p, segmentCount - 1) * loopLen + l];
                        segNormBuf.set(edgeNormal, i);
                        segNormBuf.set(edgeNormal, i + 3);
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
                    segNormBuf.set(smoothNormals[lOffset], i);
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

        for (let i = 0, l = 0, uv = 0; l < loopLen; l++) {
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