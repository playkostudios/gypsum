import triangulate2DPolygon from './triangulation/triangulate-2d-polygon';
import { MeshGroup } from './MeshGroup';
import { normalFromTriangle } from './mesh-gen/normal-from-triangle';
import { vec3, vec2, vec4 } from 'gl-matrix';
import { ExtrusionMesh } from './ExtrusionMesh';
import { MeshBuilder } from './mesh-gen/MeshBuilder';
import { Triangle } from './mesh-gen/Triangle';
import { autoConnectAllEdges } from './mesh-gen/auto-connect-all-edges';
import { autoConnectEdges } from './mesh-gen/auto-connect-edges';
import { filterHintMap } from './filter-hintmap';

import type { CurveFrame } from '../client';
import type { Material } from '@wonderlandengine/api';
import type { WonderlandEngine } from '../common/backport-shim';
import type { EdgeList } from './mesh-gen/EdgeList';
import type { HintMap } from '../common/HintMap';

const TAU = Math.PI * 2;
const ZERO_NORM = vec3.create();

function makeBase(polyline: Array<vec2>, polylineLen: number, scale: number, offset: vec3): Array<vec3> {
    const vertices = new Array<vec3>(polylineLen);

    for (let i = 0; i < polylineLen; i++) {
        const [x, z] = polyline[i];
        vertices[i] = vec3.fromValues(
            offset[0] + x * scale,
            offset[1],
            offset[2] + z * scale,
        );
    }

    return vertices;
}

function makeBaseUVs(polyline: Array<vec2>, polylineLen: number, bottomBase: boolean): Array<vec2> {
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

/**
 * A procedural mesh class that handles both prismoids and pyramids due to their
 * similarily.
 */
export class BasePrismoidPyramidMesh extends MeshGroup {
    /**
     * Create a new prismoid/pyramid hybrid. If the mesh is a prismoid, then an
     * extrusion will be created.
     *
     * @param engine - The Wonderland Engine instance to use this mesh for
     * @param polyline - The cross-section of the prismoid.
     * @param bottomScale - The scale of the bottom base. If 0, then an inverted pyramid will be created.
     * @param topScale - The scale of the top base. If 0, then a pyramid will be created.
     * @param bottomOffset - The offset of the bottom base.
     * @param topOffset - The offset of the top base.
     * @param smoothNormalMaxAngle - The maximum angle for automatic smoothing. if null, then no automatic smoothing will be done.
     * @param baseMaterial - The WL.Material to use for the base triangles.
     * @param sideMaterial - The WL.Material to use fot the side triangles.
     */
    constructor(engine: WonderlandEngine, polyline: Array<vec2>, bottomScale: number, topScale: number, bottomOffset: vec3, topOffset: vec3, smoothNormalMaxAngle: number | null, hints?: HintMap, baseMaterial: Material | null = null, sideMaterial: Material | null = null) {
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
        const hasSmoothNormals = smoothNormalMaxAngle !== null;
        if (topScale === 0 || bottomScale === 0) {
            // pyramid/cone
            const hasTopApex = (topScale === 0);
            const apexPos = hasTopApex ? topOffset : bottomOffset;
            const apexTexCoords = vec2.fromValues(0.5, 0.5); // center of circle
            const builder = new MeshBuilder(engine);

            // make transformed base vertex positions
            const basePos = makeBase(polyline, polylineLen, hasTopApex ? bottomScale : topScale, hasTopApex ? bottomOffset : topOffset);

            // (lateral)
            // pre-calculate lateral texture coordinates (just a circle). start
            // at top of circle, move CCW, completing the circle. apex is at the
            // center of the circle. each edge has the same length in UV space
            // TODO uniform edges in UV space might introduce warping if the
            // input polyline is a polygon where each edge has different
            // lengths. maybe figure out a better mapping in the future? maybe
            // directly map the x,z coordinates to u,v, normalized to 0-1?
            // knowing where to put the apex would be a problem though, since
            // the middle (0,0) might not be inside the polyline. the center of
            // gravity of the polyline could also be outside the polyline...
            const latUVs = new Array<vec2>(polylineLen);
            for (let i = 0; i < polylineLen; i++) {
                const angle = TAU * (polylineLen - 1 - i) / polylineLen;
                const u = Math.sin(angle) / 2 + 0.5;
                // XXX UV needs to be mirrored in X direction when pyramid
                // is inverted
                latUVs[i] = vec2.fromValues(
                    hasTopApex ? u : (1 - u),
                    -Math.cos(angle) / 2 + 0.5,
                );
            }

            // add lateral triangles
            for (let i = 0; i < polylineLen; i++) {
                const iNext = (i + 1) % polylineLen;
                let a = basePos[i], b = basePos[iNext], aUV = latUVs[i], bUV = latUVs[iNext];

                if (hasTopApex) {
                    [b, a, bUV, aUV] = [a, b, aUV, bUV];
                }

                let tri: Triangle;
                if (hasSmoothNormals) {
                    // XXX normals at bottom of triangle are set to zero so they
                    // can later be replaced by auto smooth normals
                    // TODO wonderland engine doesn't support weighed normals,
                    // so a zero normal at the apex can't be used to get
                    // good-looking cones. because of this, the bottom lateral
                    // is smooth, but the top lateral (near the apex) isn't;
                    // there are seams. when zero normals are supported, a
                    // different default normal value (for saying that normals
                    // need to be replaced by smoothing) will have to be used.
                    // maybe <vec3>[NaN, NaN, NaN]?
                    const triNorm = normalFromTriangle(apexPos, a, b, vec3.create());
                    tri = builder.addTriangle(apexPos, a, b);
                    tri.setNormals(triNorm, ZERO_NORM, ZERO_NORM);
                    tri.setUVs(apexTexCoords, aUV, bUV);
                } else {
                    tri = builder.addTriangle(apexPos, a, b);
                    tri.setUVs(apexTexCoords, aUV, bUV);
                }

                tri.autoSetTangents(1);
            }

            // connect side triangles
            for (let i = 0; i < polylineLen; i++) {
                const iTri = builder.triangles[i];
                const iNextTri = builder.triangles[(i + 1) % polylineLen];
                iTri.connectEdge(0, 2, iNextTri);
            }

            // apply smooth normals if neccesary
            if (hasSmoothNormals) {
                builder.addSmoothNormals(smoothNormalMaxAngle, false);
            }

            // (base)
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

            // add base triangles
            const baseNormal = vec3.fromValues(0, hasTopApex ? -1 : 1, 0);
            const baseTangent = vec4.fromValues(hasTopApex ? 1 : -1, 0, 0, 1);
            const baseUVs = makeBaseUVs(polyline, polylineLen, hasTopApex);
            const baseTris: Array<Triangle> = [];
            for (let i = 0; i < triangulatedBaseLen;) {
                const aIdx = triangulatedBase[i++];
                const bIdx = triangulatedBase[i++];
                const cIdx = triangulatedBase[i++];

                const baseTri = builder.addTriangle(basePos[aIdx], basePos[bIdx], basePos[cIdx]);
                baseTri.setNormals(baseNormal, baseNormal, baseNormal);
                baseTri.setUVs(baseUVs[aIdx], baseUVs[bIdx], baseUVs[cIdx]);
                baseTri.setTangents(baseTangent, baseTangent, baseTangent);
                baseTri.materialID = 1;

                baseTris.push(baseTri);
            }

            // auto-connect base triangles
            autoConnectAllEdges(baseTris);

            // auto-connect edges between base and lateral
            const baseEdges: EdgeList = new Array(polylineLen);
            for (let i = 0; i < polylineLen; i++) {
                baseEdges[i] = [builder.triangles[i], 1];
            }

            autoConnectEdges(baseEdges, baseTris);

            // turn to mesh and manifold
            const filteredHints = filterHintMap(true, true, true, false, hints);
            super(...builder.finalize(new Map([
                [0, sideMaterial],
                [1, baseMaterial],
            ]), filteredHints));
        } else {
            // prismoid
            const rst: CurveFrame = [ [0, 0, 1], [1, 0, 0], [0, 1, 0] ];
            const startBaseUVs = makeBaseUVs(polyline, polylineLen, true);
            const endBaseUVs = makeBaseUVs(polyline, polylineLen, false);

            return new ExtrusionMesh(
                engine,
                polyline,
                [ bottomOffset, topOffset ],
                [ rst, rst ],
                {
                    startBaseUVs,
                    endBaseUVs,
                    segmentsUVs: [0, 1, null],
                    curveScales: [ bottomScale, topScale ],
                    smoothNormals: hasSmoothNormals,
                    maxSmoothAngle: hasSmoothNormals ? smoothNormalMaxAngle : undefined,
                    startMaterial: baseMaterial,
                    endMaterial: baseMaterial,
                    segmentMaterial: sideMaterial,
                    hints,
                },
            );
        }
    }
}