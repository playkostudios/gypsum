// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../types/globals.d.ts" />

import { mat4, vec2, vec3 } from 'gl-matrix';
import { BaseManifoldWLMesh } from './BaseManifoldWLMesh';
import triangulate2DPolygon from './triangulation/triangulate-2d-polygon';
import { ManifoldBuilder } from './mesh-gen/ManifoldBuilder';
import { Triangle } from './mesh-gen/Triangle';

import type { CurveFrames } from './curves/curve-frame';
import type { EdgeList } from './mesh-gen/ManifoldBuilder';

export interface ExtrusionMaterialOptions {
    startMaterial?: WL.Material;
    endMaterial?: WL.Material;
    segmentMaterial?: WL.Material;
}

export interface ExtrusionOptions extends ExtrusionMaterialOptions {
    smoothNormals?: boolean;
    maxSmoothAngle?: number;
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

function makeBaseUVs(loopLen: number, polyline: Array<vec2>, inputBaseUVs?: Array<vec2>) {
    const baseUVs = new Array<vec2>(loopLen);
    if (inputBaseUVs) {
        if (inputBaseUVs.length !== loopLen) {
            throw new Error('Base UV count must match polyline length');
        }
    } else {
        inputBaseUVs = polyline;
    }

    for (let i = 0; i < loopLen; i++) {
        baseUVs[i] = inputBaseUVs[i];
    }

    return baseUVs;
}

export class ExtrusionMesh extends BaseManifoldWLMesh {
    constructor(polyline: Array<vec2>, curvePositions: Array<vec3>, curveFrames: CurveFrames, options?: ExtrusionOptions) {
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
        const startBaseUVs = makeBaseUVs(loopLen, polyline, options?.startBaseUVs);
        const endBaseUVs = makeBaseUVs(loopLen, polyline, options?.endBaseUVs);

        // validate curve scales
        const curveScales: Array<number> | null = options?.curveScales ?? null;
        if (curveScales && curveScales.length !== pointCount) {
            throw new Error('There must be exactly one scale per point when curve scales are specified');
        }

        // validate segment UVs
        const inputSegmentsUVs = options?.segmentsUVs;
        const segmentsUs = new Array<number>(loopLen + 1);
        const vStart = inputSegmentsUVs ? (inputSegmentsUVs[0] ?? 0) : 0;
        const vEnd = inputSegmentsUVs ? (inputSegmentsUVs[1] ?? 1) : 1;
        const vRange = vEnd - vStart;

        if (inputSegmentsUVs && inputSegmentsUVs[2]) {
            const inputSegmentsUs = inputSegmentsUVs[2];
            const hasPlusOne = inputSegmentsUs.length !== loopLen + 1;
            if (inputSegmentsUs.length !== loopLen && hasPlusOne) {
                throw new Error('Segments U count must match polyline length, or have 1 more for the wrap-around value');
            }

            for (let i = 0; i < loopLen; i++) {
                segmentsUs[i] = inputSegmentsUs[i];
            }

            if (hasPlusOne) {
                segmentsUs[loopLen] = inputSegmentsUs[loopLen];
            } else {
                segmentsUs[loopLen] = inputSegmentsUs[0];
            }
        } else {
            for (let i = 0; i <= loopLen; i++) {
                segmentsUs[i] = i / loopLen;
            }
        }

        // check if extrusion loops (if there is a loop, then bases will not be
        // generated)
        const segmentCount = pointCount - 1;
        const firstFrame = curveFrames[0];
        const lastFrame = curveFrames[segmentCount];
        let loops = vec3.equals(curvePositions[0], curvePositions[segmentCount])
            && vec3.equals(firstFrame[0], lastFrame[0])
            && vec3.equals(firstFrame[1], lastFrame[1])
            && vec3.equals(firstFrame[2], lastFrame[2]);

        // XXX don't loop if start and end base scales don't match
        // TODO a special case for this will need to be added in the future
        if (curveScales && curveScales[0] !== curveScales[segmentCount]) {
            loops = false;
        }

        // pre-calculate segment positions. vertex positions for manifold are
        // populated this way. also pre-calculate extrusion length
        const lLast = loopLen - 1;
        const loopedSegCount = loops ? segmentCount : pointCount;
        const preCalcPos = new Array<vec3>(loopLen * loopedSegCount);
        const matrix = mat4.create();
        let extrusionLength = 0;

        for (let i = 0, p = 0; p < pointCount; p++) {
            if (p > 0) {
                extrusionLength += vec3.distance(curvePositions[p], curvePositions[p - 1]);
            }

            if (p < loopedSegCount) {
                getMatrix(matrix, p, curveFrames, curvePositions, curveScales);

                for (let l = 0; l < loopLen; l++) {
                    const xy = polyline[lLast - l];
                    const pos = vec3.fromValues(xy[0], xy[1], 0) as Vec3;
                    vec3.transformMat4(pos, pos, matrix);
                    preCalcPos[i++] = pos;
                }
            }
        }

        // make segment triangles
        // XXX note that, despite the polyline being given in CCW order,
        // triangles in each segment are added in CW order because of the
        // transformation applied to the polyline
        const hasSmoothNormals = options?.smoothNormals ?? false;
        const invExtrusionLen = 1 / extrusionLength;
        let segEndLen = 0, segStartV = -1, segEndV = vStart;
        const builder = new ManifoldBuilder();

        for (let s = 0, i = 0, j = loopLen; s < segmentCount; s++, i += loopLen, j += loopLen) {
            segEndLen += vec3.distance(curvePositions[s], curvePositions[s + 1]);
            segStartV = segEndV;
            segEndV = vRange * segEndLen * invExtrusionLen + vStart;

            for (let l = 0; l < loopLen; l++) {
                const l2 = (l + 1) % loopLen;
                const il1 = i + l;
                const il2 = i + l2;
                const u1 = segmentsUs[l];
                const u2 = segmentsUs[l + 1];
                const uvi1 = vec2.fromValues(u1, segStartV);
                const uvi2 = vec2.fromValues(u2, segStartV);
                const uvj1 = vec2.fromValues(u1, segEndV);
                const uvj2 = vec2.fromValues(u2, segEndV);

                let jl1: number, jl2: number;
                if (loops && s === segmentCount - 1) {
                    jl1 = l;
                    jl2 = l2;
                } else {
                    jl1 = il1 + loopLen;
                    jl2 = il2 + loopLen;
                }

                if (hasSmoothNormals) {
                    builder.addTriangleNoNormals(preCalcPos[il1], preCalcPos[il2], preCalcPos[jl2], uvi1, uvi2, uvj2);
                    builder.addTriangleNoNormals(preCalcPos[il1], preCalcPos[jl2], preCalcPos[jl1], uvi1, uvj2, uvj1);
                } else {
                    builder.addTriangle(preCalcPos[il1], preCalcPos[il2], preCalcPos[jl2], uvi1, uvi2, uvj2);
                    builder.addTriangle(preCalcPos[il1], preCalcPos[jl2], preCalcPos[jl1], uvi1, uvj2, uvj1);
                }
            }
        }

        // add bases
        let startBaseTris: Array<Triangle> | null = null, endBaseTris: Array<Triangle> | null = null;
        if (!loops) {
            startBaseTris = [], endBaseTris = [];

            // triangulate polyline
            const triangulatedBase = triangulate2DPolygon(polyline);
            const triangulatedBaseLen = triangulatedBase.length;

            // reuse tangent from curve frame for normals
            const endNormal = curveFrames[segmentCount][2];
            const startNormal = vec3.negate(vec3.create(), endNormal);

            // start base
            for (let t = 0; t < triangulatedBaseLen;) {
                const cIdx = triangulatedBase[t++];
                const bIdx = triangulatedBase[t++];
                const aIdx = triangulatedBase[t++];

                const newTri = builder.addTriangle(
                    preCalcPos[aIdx], preCalcPos[bIdx], preCalcPos[cIdx],
                    startNormal, startNormal, startNormal,
                    startBaseUVs[aIdx], startBaseUVs[bIdx], startBaseUVs[cIdx],
                );
                newTri.materialID = 1;
                startBaseTris.push(newTri);
            }

            // end base
            const offset = preCalcPos.length - loopLen;
            for (let t = 0; t < triangulatedBaseLen;) {
                const aIdx = triangulatedBase[t++];
                const bIdx = triangulatedBase[t++];
                const cIdx = triangulatedBase[t++];

                const newTri = builder.addTriangle(
                    preCalcPos[offset + aIdx], preCalcPos[offset + bIdx], preCalcPos[offset + cIdx],
                    endNormal, endNormal, endNormal,
                    endBaseUVs[aIdx], endBaseUVs[bIdx], endBaseUVs[cIdx],
                );
                newTri.materialID = 2;
                endBaseTris.push(newTri);
            }
        }

        // connect triangles in segments, and between segments
        const segmentTriCount = loopLen * 2;
        for (let s = 0; s < segmentCount; s++) {
            const segOffset = s * segmentTriCount;

            for (let l = 0; l < segmentTriCount; l += 2) {
                // connect triangles in same quad
                const quadTriAOffset = segOffset + l;
                const quadTriBOffset = quadTriAOffset + 1;
                const triA = builder.triangles[quadTriAOffset];
                const triB = builder.triangles[quadTriBOffset];
                triA.connectEdge(2, 0, triB);

                // connect this quad with next quad on same segment (next quad
                // is to the left of this quad due to CW order)
                const nQuadTriBOffset = segOffset + (l + 3) % segmentTriCount;
                triA.connectEdge(1, 2, builder.triangles[nQuadTriBOffset]);

                // connect this quad with quad from previous segment
                if (s > 0) {
                    const pSegQuadTriBOffset = quadTriBOffset - segmentTriCount;
                    triA.connectEdge(0, 1, builder.triangles[pSegQuadTriBOffset]);
                }
            }
        }

        // connect bases or segments in loop
        const lastSegOffset = (segmentCount - 1) * segmentTriCount;
        if (loops) {
            for (let l = 0; l < segmentTriCount; l += 2) {
                // connect triangles between the loop end and start
                builder.triangles[l].connectEdge(0, 1, builder.triangles[lastSegOffset + l + 1]);
            }
        } else {
            // auto-connect bases
            const startBase = startBaseTris as Array<Triangle>;
            const endBase = endBaseTris as Array<Triangle>;
            builder.autoConnectAllEdgesOfSubset(startBase);
            builder.autoConnectAllEdgesOfSubset(endBase);

            // auto-connect edges between bases and segments
            const startEdges: EdgeList = new Array(loopLen);
            const endEdges: EdgeList = new Array(loopLen);

            for (let i = 0; i < loopLen; i++) {
                startEdges[i] = [builder.triangles[i * 2], 0];
                endEdges[i] = [builder.triangles[lastSegOffset + i * 2 + 1], 1];
            }

            builder.autoConnectEdges(startEdges, startBase);
            builder.autoConnectEdges(endEdges, endBase);
        }

        // add smooth normals
        if (hasSmoothNormals) {
            // 0.9 radians (approx. PI / 3.5) is close to 45 degrees
            builder.addSmoothNormals(options?.maxSmoothAngle ?? 0.9, false);
        }

        // setup material map
        const materialMap = new Map([
            [0, options?.segmentMaterial ?? null],
            [1, options?.startMaterial ?? null],
            [2, options?.endMaterial ?? null],
        ]);

        super(...builder.finalize(materialMap));
    }
}