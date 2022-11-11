// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../types/globals.d.ts" />

import { mat3, mat4, vec2, vec3 } from 'gl-matrix';
import { ManifoldWLMesh } from './ManifoldWLMesh';
import triangulate2DPolygon from './triangulation/triangulate-2d-polygon';
import type { CurveFrame, CurveFrames } from './rmf/curve-frame';

const temp0 = vec3.create();

export interface ExtrusionOptions {
    smoothNormals?: boolean;
    materialID?: number;
}

function getMatrix(outputMat: mat4, frame: CurveFrame, position: vec3) {
    // r (normal) = +y, s (binormal) = +x, t (tangent) = +z
    // make matrix from position and frame
    const [r, s, t] = frame;
    mat4.set(
        outputMat,
        s[0], s[1], s[2], 0,
        r[0], r[1], r[2], 0,
        t[0], t[1], t[2], 0,
        position[0], position[1], position[2], 1
    );
}

export class ExtrusionMesh extends ManifoldWLMesh {
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

        // triangulate base
        const triangulatedBase = triangulate2DPolygon(polyline);
        const triangulatedBaseLen = triangulatedBase.length;

        // calculate vertex count and prepare index data (wle and manifold)
        const hasSmoothNormals = options?.smoothNormals ?? false;
        const manifVertexCount = loopLen * pointCount;
        const vertexCount = loopLen * 2 + manifVertexCount * (hasSmoothNormals ? 1 : 2);
        const segmentCount = pointCount - 1;
        const manifTriCount = 2 * triangulatedBaseLen / 3 + segmentCount * loopLen * 2;
        const indexSize = triangulatedBaseLen * 2 + loopLen * segmentCount * 6;
        const [indexData, indexType] = ManifoldWLMesh.makeIndexBuffer(indexSize);

        // manifold mesh output
        const manifTriVerts = new Array<Vec3>(manifTriCount);
        const manifVertPos = new Array<Vec3>(manifVertexCount);

        // populate indexData
        // vertex data is not yet populated, but the order will be:
        // - start base polyline vertices
        // - segment 1 vertices (2x if hasSmoothNormals is false)
        // - ...
        // - segment [segmentCount] vertices (2x if hasSmoothNormals is false)
        // - end base polyline vertices

        // the equivalent vertex data for manifold will be:
        // - segment 1 vertices (always as if hasSmoothNormals is true)
        // - ...
        // - segment [segmentCount] vertices (always as if hasSmoothNormals is true)

        // starting base indices
        // (wle)
        indexData.set(triangulatedBase);
        // (manifold)
        let i = 0;
        let manifTri = 0;
        const lLast = loopLen - 1;
        while (i < triangulatedBaseLen) {
            // XXX manifold reuses segment positions, so the indices need to be
            // corrected to take the winding order of the polyline into account
            manifTriVerts[manifTri++] = [
                lLast - triangulatedBase[i++],
                lLast - triangulatedBase[i++],
                lLast - triangulatedBase[i++],
            ];
        }

        // segment indices
        let segmentStart = loopLen;
        const segmentStride = hasSmoothNormals ? loopLen : (loopLen * 2);
        let segmentEnd = segmentStart + segmentStride;
        let manifSegmentStart = 0;
        let manifSegmentEnd = loopLen;

        for (let s = 0; s < segmentCount; s++) {
            // (wle)
            if (hasSmoothNormals) {
                for (let l = 0; l < segmentStride; l++) {
                    const blIdx = segmentStart + l;
                    const trIdx = segmentEnd + (l + 1) % segmentStride;

                    // bottom-right triangle
                    indexData[i++] = blIdx;
                    indexData[i++] = segmentStart + (l + 1) % segmentStride;
                    indexData[i++] = trIdx;

                    // top-left triangle
                    indexData[i++] = blIdx;
                    indexData[i++] = trIdx;
                    indexData[i++] = segmentEnd + l;
                }
            } else {
                for (let l = 0; l < segmentStride; l += 2) {
                    const blIdx = segmentStart + l;
                    const tlIdx = segmentEnd + l;
                    const trIdx = tlIdx + 1;

                    // bottom-right triangle
                    indexData[i++] = blIdx;
                    indexData[i++] = blIdx + 1;
                    indexData[i++] = trIdx;

                    // top-left triangle
                    indexData[i++] = blIdx;
                    indexData[i++] = trIdx;
                    indexData[i++] = tlIdx;
                }
            }

            segmentStart += segmentStride;
            segmentEnd += segmentStride;

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
        const baseIdxOffset = segmentEnd;
        for (let j = 0; j < triangulatedBaseLen;) {
            // XXX winding order needs to be flipped since the end base is in
            // the opposite direction (ish) of the start base
            const c = triangulatedBase[j++];
            const b = triangulatedBase[j++];
            const a = triangulatedBase[j++];

            // (wle)
            indexData[i++] = a + baseIdxOffset;
            indexData[i++] = b + baseIdxOffset;
            indexData[i++] = c + baseIdxOffset;

            // (manifold)
            // XXX manifold reuses segment positions, so the indices need to be
            // corrected to take the winding order of the polyline into account
            manifTriVerts[manifTri++] = [
                lLast - a + manifSegmentStart,
                lLast - b + manifSegmentStart,
                lLast - c + manifSegmentStart,
            ];
        }

        // construct parent class
        super(vertexCount, indexData, indexType, <Mesh>{
            triVerts: manifTriVerts,
            vertPos: manifVertPos,
        });

        // get mesh accessors
        const positions = this.attribute(WL.MeshAttribute.Position);
        if (!positions) {
            throw new Error('Could not get position mesh attribute accessor');
        }
        const posBuf = new Float32Array(vertexCount * 3);

        const normals = this.attribute(WL.MeshAttribute.Normal);
        let normBuf: Float32Array | null = null;
        if (normals) {
            normBuf = new Float32Array(vertexCount * 3);
        }

        // pre-calculate untransformed normals of each edge in the polyline, and
        // smooth normals for each vertex, if smooth normals are enabled
        let edgeNormals: Array<vec3> | null = null;
        let smoothNormals: Array<vec3> | null = null;

        if (normBuf) {
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
        // populated this way
        const matrix = mat4.create();

        i = 0;
        for (let p = 0; p < pointCount; p++) {
            getMatrix(matrix, curveFrames[p], curvePositions[p]);

            for (let l = 0; l < loopLen; l++) {
                const xy = polyline[lLast - l];
                const pos = vec3.fromValues(xy[0], xy[1], 0) as Vec3;
                vec3.transformMat4(pos, pos, matrix);
                manifVertPos[i++] = pos;
            }
        }

        // make start base vertices
        getMatrix(matrix, curveFrames[0], curvePositions[0]);
        const startNormal = vec3.clone(curveFrames[0][2]); // [2] = t = curve tangent
        vec3.negate(startNormal, startNormal);

        i = 0;
        for (let l = 0; l < loopLen; l++) {
            posBuf.set(manifVertPos[lLast - l], i);

            if (normBuf) {
                normBuf.set(startNormal, i);
            }

            i += 3;
        }

        // make segment vertices
        const normalMatrix = mat3.create();

        for (let p = 0; p < pointCount; p++) {
            getMatrix(matrix, curveFrames[p], curvePositions[p]);
            const lOffset = p * loopLen;

            if (normBuf) {
                // XXX don't use normalFromMat4 or you will always get identity matrices
                mat3.fromMat4(normalMatrix, matrix);
            }

            for (let l = 0; l < loopLen; l++) {
                posBuf.set(manifVertPos[l + lOffset], i);

                if (smoothNormals) {
                    if (normBuf) {
                        vec3.transformMat3(temp0, smoothNormals[l], normalMatrix);
                        normBuf.set(temp0, i);
                    }
                } else {
                    if (normBuf) {
                        vec3.transformMat3(temp0, (edgeNormals as Array<vec3>)[l], normalMatrix);
                        normBuf.set(temp0, i);
                        normBuf.set(temp0, i + 3);
                    }

                    i += 3;

                    posBuf.set(manifVertPos[(l + 1) % loopLen + lOffset], i);
                }

                i += 3;
            }
        }

        // make end base vertices
        getMatrix(matrix, curveFrames[segmentCount], curvePositions[segmentCount]);
        const endNormal = curveFrames[segmentCount][2]; // [2] = t = curve tangent
        const lEndOffset = segmentCount * loopLen;

        for (let l = 0; l < loopLen; l++) {
            posBuf.set(manifVertPos[lEndOffset + lLast - l], i);

            if (normBuf) {
                normBuf.set(endNormal, i);
            }

            i += 3;
        }

        // upload vertex attributes
        positions.set(0, posBuf);

        if (normBuf) {
            (normals as WL.MeshAttributeAccessor).set(0, normBuf);
        }
    }
}