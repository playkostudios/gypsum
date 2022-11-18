import triangulate2DPolygon from './triangulation/triangulate-2d-polygon';
import { BaseManifoldWLMesh } from './BaseManifoldWLMesh';
import { normalFromTriangle } from './mesh-gen/normal-from-triangle';
import { vec3, vec2 } from 'gl-matrix';
import { ExtrusionMesh } from './ExtrusionMesh';
import internalCtorKey from './mesh-gen/internal-ctor-key';

import type { CurveFrame } from '../client';

const TAU = Math.PI * 2;

function makeBase(polyline: Array<vec2>, polylineLen: number, scale: number, offset: vec3): Array<vec3> {
    const vertices = new Array<vec3>(polylineLen);

    for (let i = 0; i < polylineLen; i++) {
        const [x, z] = polyline[i];
        vertices[i] = [
            offset[0] + x * scale,
            offset[1],
            offset[2] + z * scale,
        ];
    }

    return vertices;
}

function makeBaseUVs(polyline: Array<vec2>, polylineLen: number, bottomBase: boolean) {
    // pre-calculate base texture coordinates (direct mapping from x,z to u,v,
    // but normalized to 0-1)
    const baseUVs = new Array(polylineLen);

    // calculate bounds of polyline
    let xMin = Infinity, xMax = -Infinity, zMin = xMin, zMax = xMax;
    for (const [x, z] of polyline) {
        xMin = Math.min(x, xMin);
        zMin = Math.min(z, zMin);
        xMax = Math.max(x, xMax);
        zMax = Math.max(z, zMax);
    }

    const xRangeInv = 1 / (xMax - xMin);
    const zRangeInv = 1 / (zMax - zMin);

    // calculate uvs
    for (let i = 0; i < polylineLen; i++) {
        const [x, z] = polyline[i];
        const u = (x - xMin) * xRangeInv;
        baseUVs[i] = [
            bottomBase ? u : (1 - u),
            (z - zMin) * zRangeInv,
        ];
    }

    return baseUVs;
}

export class BasePrismoidPyramidMesh extends ExtrusionMesh {
    constructor(polyline: Array<vec2>, bottomScale: number, topScale: number, bottomOffset: vec3, topOffset: vec3, hasSmoothNormals: boolean) {
        // validate that there is at most one apex
        if (topScale === 0 && bottomScale === 0) {
            throw new Error('Only one of the scales can be 0');
        }

        // make sure top and bottom are in the right order
        if (bottomOffset[1] > topOffset[1]) {
            [bottomScale, topScale, bottomOffset, topOffset] = [topScale, bottomScale, topOffset, bottomOffset];
        }

        // triangulate base
        const polylineLen = polyline.length;
        const triangulatedBase = triangulate2DPolygon(polyline);
        const triangulatedBaseLen = triangulatedBase.length;

        // WARNING UV mapping pyramids is different than prisms. UVs are mapped
        // to a circle when doing pyramids/cones, while they are mapped to a
        // square when doing a prism

        // make meshes
        if (topScale === 0 || bottomScale === 0) {
            // pyramid/cone

            // (base indexes)
            const hasTopApex = (topScale === 0);
            const [baseIndexData, baseIndexType] = BaseManifoldWLMesh.makeIndexBuffer(triangulatedBaseLen);

            // bases face down by default, so if the apex is at the bottom, the
            // base needs to have its winding order inverted
            if (!hasTopApex) {
                // base faces down, so it needs an inverted winding order
                for (let i = 0; i < triangulatedBaseLen; i += 3) {
                    const temp = triangulatedBase[i];
                    triangulatedBase[i] = triangulatedBase[i + 1];
                    triangulatedBase[i + 1] = temp;
                }
            }

            baseIndexData.set(triangulatedBase, 0);

            const baseMesh = new WL.Mesh({
                vertexCount: polylineLen,
                indexData: baseIndexData,
                indexType: baseIndexType
            });

            // (lateral indices)
            const [latIndexData, latIndexType] = BaseManifoldWLMesh.makeIndexBuffer(polylineLen * 4);

            // index format:
            // [polylineLen]: base vertices (if smooth normals)
            // [polylineLen*2]: base start and end vertices for each lateral (if hard normals)
            //     0: triangle 0 start vertex
            //     1: triangle 0 end vertex
            //     2: triangle 1 start vertex
            //     3: triangle 1 end vertex
            //     etc...
            // [polylineLen]: apex vertices
            let j = 0;
            if (hasSmoothNormals) {
                for (let i = 0; i < polylineLen; i++) {
                    const i2 = (i + 1) % polylineLen;
                    latIndexData[j++] = polylineLen + i;
                    if (hasTopApex) {
                        latIndexData[j++] = i2;
                        latIndexData[j++] = i;
                    } else {
                        latIndexData[j++] = i;
                        latIndexData[j++] = i2;
                    }
                }
            } else {
                const apexIndexStart = polylineLen * 2;

                for (let i = 0; i < polylineLen; i ++) {
                    const i2 = i * 2;
                    latIndexData[j++] = apexIndexStart + i;
                    if (hasTopApex) {
                        latIndexData[j++] = i2 + 1;
                        latIndexData[j++] = i2;
                    } else {
                        latIndexData[j++] = i2;
                        latIndexData[j++] = i2 + 1;
                    }
                }
            }

            const latMesh = new WL.Mesh({
                vertexCount: polylineLen * 2 + (hasSmoothNormals ? 0 : polylineLen),
                indexData: latIndexData,
                indexType: latIndexType
            });

            // get vertex attributes for both base and lateral
            const basePositions = baseMesh.attribute(WL.MeshAttribute.Position);
            const baseNormals = baseMesh.attribute(WL.MeshAttribute.Normal);
            const baseTexCoords = baseMesh.attribute(WL.MeshAttribute.TextureCoordinate);
            const latPositions = latMesh.attribute(WL.MeshAttribute.Position);
            const latNormals = latMesh.attribute(WL.MeshAttribute.Normal);
            const latTexCoords = latMesh.attribute(WL.MeshAttribute.TextureCoordinate);

            if (!basePositions) {
                throw new Error('Could not get positions mesh attribute accessor');
            }
            if (!latPositions) {
                throw new Error('Could not get positions mesh attribute accessor');
            }

            // (base vertices)
            const baseScale = hasTopApex ? bottomScale : topScale;
            const baseOffset = hasTopApex ? bottomOffset : topOffset;
            const base = makeBase(polyline, polylineLen, baseScale, baseOffset);

            const baseNormal = [0, hasTopApex ? -1 : 1, 0];

            let baseUVs: Array<vec2> | null = null;
            if (baseTexCoords) {
                baseUVs = makeBaseUVs(polyline, polylineLen, hasTopApex);
            }

            for (let i = 0; i < polylineLen; i++) {
                basePositions.set(i, base[i]);

                if (baseNormals) {
                    baseNormals.set(i, baseNormal);
                }
                if (baseUVs) {
                    baseTexCoords.set(i, baseUVs[i]);
                }
            }

            // (lateral vertices)
            const apexPos = hasTopApex ? topOffset : bottomOffset;
            let edgeNormals: Array<vec3> | null = null;
            let smoothNormals: Array<vec3> | null = null;
            if (latNormals) {
                // precalculate normals for each face
                edgeNormals = new Array(polylineLen);

                if (hasSmoothNormals) {
                    smoothNormals = new Array(polylineLen);
                }

                for (let i = 0; i < polylineLen; i++) {
                    const edgeNormal = vec3.create();
                    const i2 = (i + 1) % polylineLen;

                    if (hasTopApex) {
                        normalFromTriangle(base[i2], base[i], apexPos, edgeNormal);
                    } else {
                        normalFromTriangle(base[i], base[i2], apexPos, edgeNormal);
                    }

                    edgeNormals[i] = edgeNormal;
                }

                if (smoothNormals) {
                    for (let i = 0; i < polylineLen; i++) {
                        const smoothNormal = vec3.clone(edgeNormals[i]);
                        vec3.add(smoothNormal, smoothNormal, edgeNormals[(i + polylineLen - 1) % polylineLen]);
                        vec3.normalize(smoothNormal, smoothNormal);
                        smoothNormals[i] = smoothNormal;
                    }
                }
            }

            let latUVs: Array<vec2> | null = null;
            if (latTexCoords) {
                // pre-calculate lateral texture coordinates (just a circle)
                latUVs = new Array(polylineLen);

                // start at top of circle, move CCW, completing the circle. apex
                // is at the center of the circle. each edge has the same length
                // in UV space
                // TODO uniform edges in UV space might introduce warping if the
                // input polyline is a polygon where each edge has different
                // lengths. maybe figure out a better mapping in the future?
                // maybe directly map the x,z coordinates to u,v, normalized to
                // 0-1? knowing where to put the apex would be a problem though,
                // since the middle (0,0) might not be inside the polyline. the
                // center of gravity of the polyline could also be outside the
                // polyline... mmmm...
                for (let i = 0; i < polylineLen; i++) {
                    const angle = TAU * (polylineLen - 1 - i) / polylineLen;
                    const u = Math.sin(angle) / 2 + 0.5;
                    // XXX UV needs to be mirrored in X direction when pyramid
                    // is inverted
                    latUVs[i] = [
                        hasTopApex ? u : (1 - u),
                        -Math.cos(angle) / 2 + 0.5,
                    ];
                }
            }

            j = 0;
            for (let i = 0; i < polylineLen; i++) {
                latPositions.set(j, base[i]);

                if (latUVs) {
                    latTexCoords.set(j, latUVs[i]);
                }

                if (edgeNormals) {
                    if (smoothNormals) {
                        latNormals.set(j, smoothNormals[i]);
                    } else {
                        latNormals.set(j, edgeNormals[i]);

                        j++

                        const iNext = (i + 1) % polylineLen;
                        latPositions.set(j, base[iNext]);
                        if (latUVs) {
                            latTexCoords.set(j, latUVs[iNext]);
                        }
                        latNormals.set(j, edgeNormals[i]);
                    }
                }

                j++;
            }

            // TODO wonderland engine doesn't support weighed normals, so a zero
            // normal at the apex can't be used to get good-looking cones.
            // because of this, the bottom lateral is smooth, but the top
            // lateral (near the apex) isn't; there are seams
            const apexTexCoords = vec2.fromValues(0.5, 0.5);
            for (let i = 0; i < polylineLen; i++) {
                latPositions.set(j, apexPos);

                if (smoothNormals) {
                    latNormals.set(j, smoothNormals[i]);
                } else if (edgeNormals) {
                    latNormals.set(j, edgeNormals[i]);
                }

                if (latTexCoords) {
                    latTexCoords.set(j, apexTexCoords); // center of circle
                }

                j++;
            }

            // TODO manifold

            super([
                internalCtorKey,
                [[baseMesh, null], [latMesh, null]],
                undefined,
                undefined
            ]);
        } else {
            // prismoid
            const rst: CurveFrame = [ [0, 0, 1], [1, 0, 0], [0, 1, 0] ];
            const startBaseUVs = makeBaseUVs(polyline, polylineLen, true);
            const endBaseUVs = makeBaseUVs(polyline, polylineLen, false);

            super(
                polyline,
                [ bottomOffset, topOffset ],
                [ rst, rst ],
                {
                    startBaseUVs,
                    endBaseUVs,
                    segmentsUVs: [0, 1, null],
                    curveScales: [ bottomScale, topScale ],
                    smoothNormals: hasSmoothNormals,
                },
            )
        }
    }

    clone(): BasePrismoidPyramidMesh {
        throw new Error('NIY: clone');
    }
}