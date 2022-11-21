import { BaseManifoldWLMesh, Submesh } from './BaseManifoldWLMesh';
import { vec2, vec3 } from 'gl-matrix';

const TAU_INV = 1 / (Math.PI * 2);

function makeFaceIndices(indexData: Array<number>, j: number, mainSegCount: number, crossSegCount: number, vertexOffset: number): number {
    const crossSegCountP1 = crossSegCount + 1;

    for (let m = 0; m < mainSegCount; m++) {
        const mainOffset = m * crossSegCountP1 + vertexOffset;

        for (let c = 0; c < crossSegCount; c++) {
            const offset1 = mainOffset + c;
            const offset2 = offset1 + 1;
            const nextOffset1 = offset1 + crossSegCountP1;

            // top-left triangle
            indexData[j++] = offset1;
            indexData[j++] = offset2;
            indexData[j++] = nextOffset1;
            // bottom-right triangle
            indexData[j++] = offset2;
            indexData[j++] = nextOffset1 + 1;
            indexData[j++] = nextOffset1;
        }
    }

    return j;
}

type MapVertexEquirectClosure = (pos: vec3, normal: vec3 | null, texCoord: vec2 | null, radius: number, isFirstHalf: boolean | null) => void;

function makeFaceVertices(mapVertexEquirectClosure: MapVertexEquirectClosure, radius: number, isFirstHalf: boolean | null, isEquirect: boolean, posBuf: Float32Array, normBuf: Float32Array | null, texCoordBuf: Float32Array | null, j2: number, j3: number, mainSegCount: number, crossSegCount: number, origin: vec3, mainDir: vec3, crossDir: vec3): [j2: number, j3: number] {
    for (let m = 0; m <= mainSegCount; m++) {
        const mainPosContrib = vec3.scaleAndAdd(vec3.create(), origin, mainDir, m / mainSegCount);

        for (let c = 0; c <= crossSegCount; c++) {
            const pos = vec3.scaleAndAdd(vec3.create(), mainPosContrib, crossDir, c / crossSegCount);
            const normal = normBuf ? vec3.create() : null;
            const texCoord = texCoordBuf ? vec2.create() : null;
            mapVertexEquirectClosure(pos, normal, texCoord, radius, isFirstHalf);

            posBuf.set(pos, j3);

            if (normBuf) {
                normBuf.set(normal as vec3, j3);
            }

            if (texCoordBuf) {
                texCoordBuf.set(texCoord as vec2, j2);
                j2 += 2;
            }

            j3 += 3;
        }
    }

    return [j2, j3];
}

export abstract class MappedSubDivCubeMesh extends BaseManifoldWLMesh {
    constructor(equirectangular: boolean, segCount: number, poleSegCount: number, radius: number, lMat?: WL.Material, rMat?: WL.Material, dMat?: WL.Material, uMat?: WL.Material, bMat?: WL.Material, fMat?: WL.Material) {
        // validate segments
        if (segCount < 1) {
            throw new Error('There must be at least one segment');
        }

        if (equirectangular) {
            // validate pole segments
            if (poleSegCount < 1) {
                throw new Error('There must be at least one pole segment');
            }

            // make sure segment counts are multiples of 2
            if (segCount % 2 !== 0) {
                segCount = Math.ceil(segCount / 2) * 2;
                console.warn('Segment count must be a multiple of 2 for equirectangular projections, rounded up to next multiple of 2');
            }

            if (poleSegCount % 2 !== 0) {
                poleSegCount = Math.ceil(poleSegCount / 2) * 2;
                console.warn('Pole segment count must be a multiple of 2 for equirectangular projections, rounded up to next multiple of 2');
            }

            // make index array
            const halfSegCount = segCount / 2;
            const halfPoleSegCount = poleSegCount / 2;
            // XXX back face, top face and bottom face are actually 2 half-faces
            // so that there is a discontinuity between u1 and u0 when wrapping
            // around
            const indexCount = segCount * segCount * 24 + poleSegCount * poleSegCount * 12;
            const segCountP1 = segCount + 1;
            const halfSegCountP1 = halfSegCount + 1;
            const poleSegCountP1 = poleSegCount + 1;
            const halfPoleSegCountP1 = halfPoleSegCount + 1;
            const halfPlaneVertexCount = halfSegCountP1 * segCountP1;
            const polePlaneVertexCount = halfPoleSegCountP1 * poleSegCountP1;
            const planeVertexCount = segCountP1 * segCountP1;
            const vertexCount = halfPlaneVertexCount * 2 + polePlaneVertexCount * 4 + planeVertexCount * 3;
            const [indexData, indexType] = BaseManifoldWLMesh.makeIndexBuffer(indexCount);
            const unsafeIndexData = indexData as unknown as Array<number>;
            let vertexOffset = 0, j = 0;

            // up face (first half (0 >= u <= 0.5), then second half (0.5 >= u <= 1) )
            // down face (first, then second)
            for (let i = 0; i < 4; i++) {
                j = makeFaceIndices(unsafeIndexData, j, halfPoleSegCount, poleSegCount, vertexOffset);
                vertexOffset += polePlaneVertexCount;
            }

            // back face (first, then second)
            for (let i = 0; i < 2; i++) {
                j = makeFaceIndices(unsafeIndexData, j, halfSegCount, segCount, vertexOffset);
                vertexOffset += halfPlaneVertexCount;
            }

            // left face
            // front face
            // right face
            for (let i = 0; i < 3; i++) {
                j = makeFaceIndices(unsafeIndexData, j, segCount, segCount, vertexOffset);
                vertexOffset += planeVertexCount;
            }

            if (j !== indexCount) {
                throw new Error(`Assertion failed: expected real index count (${j}) to match allocated index count (${indexCount})`);
            }

            // make mesh
            const mesh = new WL.Mesh({ vertexCount, indexData, indexType });
            super([[ mesh, null ]]);

            const positions = mesh.attribute(WL.MeshAttribute.Position);
            if (!positions) {
                throw new Error('Could not get positions mesh attribute accessor');
            }
            const posBuf = new Float32Array(vertexCount * 3);

            const normals = mesh.attribute(WL.MeshAttribute.Normal);
            let normBuf: Float32Array | null = null;
            if (normals) {
                normBuf = new Float32Array(vertexCount * 3);
            }

            const texCoords = mesh.attribute(WL.MeshAttribute.TextureCoordinate);
            let texCoordBuf: Float32Array | null = null;
            if (texCoords) {
                texCoordBuf = new Float32Array(vertexCount * 2);
            }

            // populate vertex data
            let j2 = 0, j3 = 0;
            const mapVertexClosure = this.mapVertexEquirect.bind(this);

            // up face
            const uMDir: vec3 = [0.5, 0, 0];
            const uCDir: vec3 = [0, 0, 1];
            //   (first half (0 >= u <= 0.5) )
            [j2, j3] = makeFaceVertices(mapVertexClosure, radius, true, true, posBuf, normBuf, texCoordBuf, j2, j3, halfPoleSegCount, poleSegCount, [-0.5, 0.5, -0.5], uMDir, uCDir);
            //   (second half (0.5 >= u <= 1) )
            [j2, j3] = makeFaceVertices(mapVertexClosure, radius, false, true, posBuf, normBuf, texCoordBuf, j2, j3, halfPoleSegCount, poleSegCount, [0, 0.5, -0.5], uMDir, uCDir);

            // down face
            const dMDir: vec3 = [0.5, 0, 0];
            const dCDir: vec3 = [0, 0, -1];
            //   (first)
            [j2, j3] = makeFaceVertices(mapVertexClosure, radius, true, true, posBuf, normBuf, texCoordBuf, j2, j3, halfPoleSegCount, poleSegCount, [-0.5, -0.5, 0.5], dMDir, dCDir);
            //   (second)
            [j2, j3] = makeFaceVertices(mapVertexClosure, radius, false, true, posBuf, normBuf, texCoordBuf, j2, j3, halfPoleSegCount, poleSegCount, [0, -0.5, 0.5], dMDir, dCDir);

            // back face
            const bMDir: vec3 = [-0.5, 0, 0];
            const bCDir: vec3 = [0, -1, 0];
            //   (first)
            [j2, j3] = makeFaceVertices(mapVertexClosure, radius, true, true, posBuf, normBuf, texCoordBuf, j2, j3, halfSegCount, segCount, [0, 0.5, -0.5], bMDir, bCDir);
            //   (second)
            [j2, j3] = makeFaceVertices(mapVertexClosure, radius, false, true, posBuf, normBuf, texCoordBuf, j2, j3, halfSegCount, segCount, [0.5, 0.5, -0.5], bMDir, bCDir);

            // left face
            const lMDir: vec3 = [0, 0, 1];
            const lCDir: vec3 = [0, -1, 0];
            [j2, j3] = makeFaceVertices(mapVertexClosure, radius, null, true, posBuf, normBuf, texCoordBuf, j2, j3, segCount, segCount, [-0.5, 0.5, -0.5], lMDir, lCDir);

            // front face
            const fMDir: vec3 = [1, 0, 0];
            const fCDir: vec3 = [0, -1, 0];
            [j2, j3] = makeFaceVertices(mapVertexClosure, radius, null, true, posBuf, normBuf, texCoordBuf, j2, j3, segCount, segCount, [-0.5, 0.5, 0.5], fMDir, fCDir);

            // right face
            const rMDir: vec3 = [0, 0, -1];
            const rCDir: vec3 = [0, -1, 0];
            [j2, j3] = makeFaceVertices(mapVertexClosure, radius, null, true, posBuf, normBuf, texCoordBuf, j2, j3, segCount, segCount, [0.5, 0.5, 0.5], rMDir, rCDir);

            if (j3 !== vertexCount * 3) {
                throw new Error(`Assertion failed: expected real vertex 3D components count (${j3}) to match allocated vertex 3D components count (${vertexCount * 3})`);
            }

            // upload vertex data
            positions.set(0, posBuf);

            if (normBuf) {
                (normals as WL.MeshAttributeAccessor).set(0, normBuf);
            }
            if (texCoordBuf) {
                (texCoords as WL.MeshAttributeAccessor).set(0, texCoordBuf);
            }
        } else {
            // make index arrays
            const faceIndexCount = segCount * segCount * 6;
            const segCountP1 = segCount + 1;
            const vertexCount = segCountP1 * segCountP1;

            const materials = [
                lMat ?? null, rMat ?? null,
                dMat ?? null, uMat ?? null,
                bMat ?? null, fMat ?? null,
            ];

            const subMeshes: Array<Submesh> = new Array(6);
            for (let i = 0; i < 6; i++) {
                const [indexData, indexType] = BaseManifoldWLMesh.makeIndexBuffer(faceIndexCount);
                makeFaceIndices(indexData as unknown as Array<number>, 0, segCount, segCount, 0);
                const mesh = new WL.Mesh({ vertexCount, indexData, indexType });
                subMeshes[i] = [ mesh, materials[i] ];
            }

            super(subMeshes);

            // populate vertex data
            const faces: Array<[ mainDir: vec3, crossDir: vec3, origin: vec3 ]> = [
                [[0, 0, 1], [0, -1, 0], [-0.5, 0.5, -0.5]], // left
                [[0, 0, -1], [0, -1, 0], [0.5, 0.5, 0.5]], // right
                [[1, 0, 0], [0, 0, -1], [-0.5, -0.5, 0.5]], // down
                [[1, 0, 0], [0, 0, 1], [-0.5, 0.5, -0.5]], // up
                [[-1, 0, 0], [0, -1, 0], [0.5, 0.5, -0.5]], // back
                [[1, 0, 0], [0, -1, 0], [-0.5, 0.5, 0.5]], // front
            ];
            const tmp = vec3.create();

            for (let i = 0; i < 6; i++) {
                // get mesh attribute accessors
                const mesh = subMeshes[i][0];

                const positions = mesh.attribute(WL.MeshAttribute.Position);
                if (!positions) {
                    throw new Error('Could not get positions mesh attribute accessor');
                }
                const posBuf = new Float32Array(vertexCount * 3);

                const normals = mesh.attribute(WL.MeshAttribute.Normal);
                let normBuf: Float32Array | null = null;
                if (normals) {
                    normBuf = new Float32Array(vertexCount * 3);
                }

                const texCoords = mesh.attribute(WL.MeshAttribute.TextureCoordinate);
                let texCoordBuf: Float32Array | null = null;
                if (texCoords) {
                    texCoordBuf = new Float32Array(vertexCount * 2);
                }

                // calculate UVs and project vertex
                const [ mainDir, crossDir, origin ] = faces[i];
                let j2 = 0, j3 = 0;
                for (let m = 0; m <= segCount; m++) {
                    const u = m / segCount;
                    const mainPosContrib = vec3.scaleAndAdd(tmp, origin, mainDir, u);

                    for (let c = 0; c <= segCount; c++) {
                        const vOpposite = c / segCount;
                        const pos = vec3.scaleAndAdd(vec3.create(), mainPosContrib, crossDir, vOpposite);
                        const normal = normBuf ? vec3.create() : null;

                        if (texCoordBuf) {
                            texCoordBuf.set([ u, 1 - vOpposite ], j2);
                            j2 += 2;
                        }

                        this.mapVertexBox(pos, normal, radius);

                        posBuf.set(pos, j3);

                        if (normBuf) {
                            normBuf.set(normal as vec3, j3);
                        }

                        j3 += 3;
                    }
                }

                // upload vertex data
                positions.set(0, posBuf);

                if (normBuf) {
                    (normals as WL.MeshAttributeAccessor).set(0, normBuf);
                }
                if (texCoordBuf) {
                    (texCoords as WL.MeshAttributeAccessor).set(0, texCoordBuf);
                }
            }
        }
    }

    clone(): MappedSubDivCubeMesh {
        throw new Error('NIY: clone');
    }

    static mapEquirectUVs(normal: vec3, texCoord: vec2, isFirstHalf: boolean | null) {
        // calculate yaw and pitch from normalized position
        const dx = normal[0];
        const dy = normal[1];
        const dz = normal[2];
        let u = Math.atan2(dx, dz) * TAU_INV + 0.5;

        // correctly handle wrap-around point
        if (isFirstHalf && u > 0.75) {
            u -= 1;
        }

        texCoord[0] = u;
        texCoord[1] = 1 - (Math.atan2(Math.sqrt(dx * dx + dz * dz), dy) * TAU_INV - 0.25);
    }

    protected abstract mapVertexEquirect(pos: vec3, normal: vec3 | null, texCoord: vec2 | null, radius: number, isFirstHalf: boolean | null): void;
    protected abstract mapVertexBox(pos: vec3, normal: vec3 | null, radius: number): void;
}