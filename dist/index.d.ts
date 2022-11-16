declare module 'manifold-wle/client/BaseManifoldWLMesh' {
  /// <reference path="../../../../home/rafael/Projects/JS/manifold-wle/types/globals.d.ts" />
  /**
   * Maps a manifold triangle index to a WLE submesh index. The format is:
   * [0]: submesh index of manifold triangle 0
   * [1]: triangle index of manifold triangle 0
   * [2]: submesh index of manifold triangle 1
   * [3]: triangle index of manifold triangle 1
   * ...
   * [2n]: submesh index of manifold triangle n
   * [2n + 1]: triangle index of manifold triangle n
   */
  export type SubmeshMap = Float32Array;
  export type Submesh = [mesh: WL.Mesh, material: WL.Material];
  export abstract class BaseManifoldWLMesh {
      protected submeshes: Array<Submesh>;
      protected premadeManifoldMesh?: Mesh | undefined;
      protected submeshMap?: Float32Array | undefined;
      /**
       * WARNING: the submeshes array and the manifold mesh will have their
       * ownership tranferred to this object. if you modify them later, they will
       * be modified here as well, possibly corrupting the mesh. to avoid issues
       * with this, do a deep clone of the inputs
       */
      constructor(submeshes?: Array<Submesh>, premadeManifoldMesh?: Mesh | undefined, submeshMap?: Float32Array | undefined);
      get manifoldMesh(): Mesh;
      abstract clone(): BaseManifoldWLMesh;
      get submeshCount(): number;
      getSubmesh(submeshIdx: number): Submesh;
      getSubmeshes(): Array<Submesh>;
      getTriBarySubmesh(triIdx: number): [submesh: Submesh, iTriOrig: number];
      static manifoldToWLE(mesh: Mesh): WL.Mesh;
      static manifoldFromWLE(wleMeshes: WL.Mesh | Array<WL.Mesh>): [submeshMap: SubmeshMap, manifoldMesh: Mesh];
      static manifoldFromWLE(wleMeshes: WL.Mesh | Array<WL.Mesh>, genSubmeshMap: true): [submeshMap: SubmeshMap, manifoldMesh: Mesh];
      static manifoldFromWLE(wleMeshes: WL.Mesh | Array<WL.Mesh>, genSubmeshMap: false): Mesh;
      static makeIndexBuffer(size: number): [indexData: Uint8Array, indexType: WL.MeshIndexType] | [indexData: Uint16Array, indexType: WL.MeshIndexType] | [indexData: Uint32Array, indexType: WL.MeshIndexType];
  }

}
declare module 'manifold-wle/client/CubeMesh' {
  import { CuboidMaterialOptions, RectangularCuboidMesh } from 'manifold-wle/client/RectangularCuboidMesh';
  export class CubeMesh extends RectangularCuboidMesh {
      constructor(length: number, options?: CuboidMaterialOptions);
  }

}
declare module 'manifold-wle/client/ExtrusionMesh' {
  /// <reference path="../../../../home/rafael/Projects/JS/manifold-wle/types/globals.d.ts" />
  import { vec2, vec3 } from 'gl-matrix';
  import { BaseManifoldWLMesh, Submesh, SubmeshMap } from 'manifold-wle/client/BaseManifoldWLMesh';
  import type { CurveFrames } from 'manifold-wle/client/rmf/curve-frame';
  type InternalCtorArgs = [ctorKey: symbol, submeshes: Array<Submesh>, premadeManifoldMesh: Mesh, submeshMap: SubmeshMap];
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
  }
  export class ExtrusionMesh extends BaseManifoldWLMesh {
      constructor(internalCtorArgs: InternalCtorArgs);
      constructor(polyline: Array<vec2>, curvePositions: Array<vec3>, curveFrames: CurveFrames, options?: ExtrusionOptions);
      clone(materials?: ExtrusionMaterialOptions): ExtrusionMesh;
  }
  export {};

}
declare module 'manifold-wle/client/LinearExtrusionMesh' {
  /// <reference path="../../../../home/rafael/Projects/JS/manifold-wle/types/globals.d.ts" />
  import { ExtrusionMesh } from 'manifold-wle/client/ExtrusionMesh';
  import type { vec2 } from 'gl-matrix';
  import type { ExtrusionOptions } from 'manifold-wle/client/ExtrusionMesh';
  export class LinearExtrusionMesh extends ExtrusionMesh {
      constructor(polyline: Array<vec2>, depth: number, options?: ExtrusionOptions);
  }

}
declare module 'manifold-wle/client/ManifoldPool' {
  /// <reference path="../../../../home/rafael/Projects/JS/manifold-wle/types/globals.d.ts" />
  import { CSGOperation } from 'manifold-wle/common/CSGOperation';
  import { BaseManifoldWLMesh } from 'manifold-wle/client/BaseManifoldWLMesh';
  type MeshArr = Array<[mesh: WL.Mesh, material: WL.Material | null]>;
  type JobResult = MeshArr | boolean | number | Box | Properties | Curvature;
  export class ManifoldPool {
      private wantedWorkerCount;
      private workerPath;
      private libraryPath;
      private workers;
      private nextJobID;
      private jobs;
      constructor(workerCount?: number | null, workerPath?: string, libraryPath?: string);
      private toManifoldMesh;
      private meshToWLEArr;
      private initializeSingle;
      private initialize;
      private getBestWorker;
      dispatch(operation: CSGOperation<BaseManifoldWLMesh | WL.Mesh>): Promise<JobResult>;
  }
  export {};

}
declare module 'manifold-wle/client/ManifoldWLMesh' {
  import { BaseManifoldWLMesh } from 'manifold-wle/client/BaseManifoldWLMesh';
  export class ManifoldWLMesh extends BaseManifoldWLMesh {
      static fromWLEMesh(mesh: WL.Mesh, material: WL.Material): ManifoldWLMesh;
      addSubmesh(mesh: WL.Mesh, material: WL.Material): number;
      clone(materials?: Array<WL.Material>): ManifoldWLMesh;
  }

}
declare module 'manifold-wle/client/RectangularCuboidMesh' {
  import { BaseManifoldWLMesh, Submesh, SubmeshMap } from 'manifold-wle/client/BaseManifoldWLMesh';
  import type { vec2 } from 'gl-matrix';
  type InternalCtorArgs = [ctorKey: symbol, width: number, height: number, depth: number, submeshes: Array<Submesh>, premadeManifoldMesh: Mesh, submeshMap: SubmeshMap];
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
  export class RectangularCuboidMesh extends BaseManifoldWLMesh {
      readonly width: number;
      readonly height: number;
      readonly depth: number;
      constructor(internalCtorArgs: InternalCtorArgs);
      constructor(width: number, height: number, depth: number, options?: CuboidOptions);
      clone(materials?: CuboidMaterialOptions): RectangularCuboidMesh;
  }
  export {};

}
declare module 'manifold-wle/client/VertexHasher' {
  export default class VertexHasher {
      buckets: Map<number, Float32Array[]>;
      private murmur_32_scramble;
      private murmur3_32;
      private getHash;
      isUnique(pos: Float32Array): boolean;
      clear(): void;
  }

}
declare module 'manifold-wle/client/polylines/circle-polyline' {
  import type { vec2 } from 'gl-matrix';
  export function makeCirclePolyline(radius: number, clockwise?: boolean, subDivisions?: number): Array<vec2>;

}
declare module 'manifold-wle/client/polylines/cube-polyline' {
  import { vec2 } from 'gl-matrix';
  export function makeCubePolyline(length: number, clockwise?: boolean): Array<vec2>;

}
declare module 'manifold-wle/client/polylines/rectangle-polyline' {
  import { vec2 } from 'gl-matrix';
  export function makeRectanglePolyline(width: number, height: number, clockwise?: boolean): Array<vec2>;

}
declare module 'manifold-wle/client/polylines/regular-polyline' {
  import { vec2 } from 'gl-matrix';
  export function makeRegularPolyline(radius: number, sides: number, clockwise?: boolean): Array<vec2>;

}
declare module 'manifold-wle/client/polylines/star-polyline' {
  import { vec2 } from 'gl-matrix';
  export function makeStarPolyline(outerRadius: number, innerRadius: number, sides: number, clockwise?: boolean): Array<vec2>;

}
declare module 'manifold-wle/client/rmf/curve-frame' {
  import type { vec3 } from 'gl-matrix';
  /**
   * A frame (point directions) of a curve.
   * r: normal
   * s: binormal
   * t: tangent
   */
  export type CurveFrame = [r: vec3, s: vec3, t: vec3];
  export type CurveFrames = Array<CurveFrame>;

}
declare module 'manifold-wle/client/rmf/make-rotation-minimizing-frames' {
  import { vec3 } from 'gl-matrix';
  import type { CurveFrames } from 'manifold-wle/client/rmf/curve-frame';
  export interface RMFOptions {
      endNormal?: vec3;
      twists?: number;
  }
  export function makeRotationMinimizingFrames(positions: Array<vec3>, tangents: Array<vec3>, startNormal: vec3, options?: RMFOptions): CurveFrames;

}
declare module 'manifold-wle/client/triangulation/is-clockwise-2d-polygon' {
  import type { vec2 } from 'gl-matrix';
  export default function isClockwise2DPolygon(polyline: Array<vec2>): boolean;

}
declare module 'manifold-wle/client/triangulation/is-clockwise-2d-triangle' {
  import type { vec2 } from 'gl-matrix';
  export default function isClockwise2DTriangle(a: vec2, b: vec2, c: vec2): boolean;

}
declare module 'manifold-wle/client/triangulation/partition-2d-polygon' {
  import { vec2 } from 'gl-matrix';
  export default function partition2DPolygon(polyline: Array<vec2>, output?: Array<Array<vec2>>, isClockwiseHint?: boolean): vec2[][];

}
declare module 'manifold-wle/client/triangulation/sort-2d-indices' {
  import type { vec2 } from 'gl-matrix';
  export default function sort2DIndices(polyline: Array<vec2>): Array<number>;

}
declare module 'manifold-wle/client/triangulation/split-2d-polygon' {
  import { vec2 } from 'gl-matrix';
  export default function split2DPolygon(polyline: Array<vec2>, diagonals: Array<[number, number]>, output?: Array<Array<vec2>>, flip?: boolean): Array<Array<vec2>>;

}
declare module 'manifold-wle/client/triangulation/triangulate-2d-polygon' {
  import { vec2 } from 'gl-matrix';
  export default function triangulate2DPolygon(polyline: Array<vec2>, output?: Array<number>): Array<number>;

}
declare module 'manifold-wle/client/triangulation/triangulate-monotone-2d-polygon' {
  import { vec2 } from 'gl-matrix';
  export default function triangulateMonotone2DPolygon(polyline: Array<vec2>, output?: Array<number>, index?: number, isClockwiseHint?: boolean): [trianglesIndices: Array<number>, lastIndex: number];

}
declare module 'manifold-wle/client' {
  export * from 'manifold-wle/client/polylines/circle-polyline';
  export * from 'manifold-wle/client/polylines/cube-polyline';
  export * from 'manifold-wle/client/polylines/rectangle-polyline';
  export * from 'manifold-wle/client/polylines/regular-polyline';
  export * from 'manifold-wle/client/polylines/star-polyline';
  export * from 'manifold-wle/client/rmf/curve-frame';
  export * from 'manifold-wle/client/rmf/make-rotation-minimizing-frames';
  export * from 'manifold-wle/client/BaseManifoldWLMesh';
  export * from 'manifold-wle/client/CubeMesh';
  export * from 'manifold-wle/client/ExtrusionMesh';
  export * from 'manifold-wle/client/LinearExtrusionMesh';
  export * from 'manifold-wle/client/ManifoldPool';
  export * from 'manifold-wle/client/ManifoldWLMesh';
  export * from 'manifold-wle/client/RectangularCuboidMesh';

}
declare module 'manifold-wle/common/CSGFinalOperation' {
  import type { CSGTree } from 'manifold-wle/common/CSGTree';
  export type CSGFinalOperation<MeshType> = {
      operation: 'isEmpty' | 'numVert' | 'numTri' | 'numEdge' | 'boundingBox' | 'precision' | 'genus' | 'getProperties' | 'getCurvature' | 'originalID';
      manifold: CSGTree<MeshType> | MeshType;
  };

}
declare module 'manifold-wle/common/CSGGeometricOperation' {
  import type { CSGTree } from 'manifold-wle/common/CSGTree';
  export type CSGGeometricOperation<MeshType> = ({
      operation: 'add' | 'union' | 'subtract' | 'difference' | 'intersect' | 'intersection';
  } & ({
      left: CSGTree<MeshType> | MeshType;
      right: CSGTree<MeshType> | MeshType;
  } | {
      manifolds: Array<CSGTree<MeshType> | MeshType>;
  })) | ({
      manifold: CSGTree<MeshType> | MeshType;
  } & ({
      operation: 'translate';
      offset: Vec3;
  } | {
      operation: 'rotate';
      degrees: Vec3;
  } | {
      operation: 'scale';
      factor: Vec3 | number;
  } | {
      operation: 'transform';
      matrix: Matrix3x4;
  } | {
      operation: 'refine';
      splits: number;
  } | {
      operation: 'asOriginal';
  })) | {
      operation: 'extrude';
      crossSection: Polygons;
      height: number;
      nDivisions?: number;
      twistDegrees?: number;
      scaleTop?: Vec2;
  } | {
      operation: 'revolve';
      crossSection: Polygons;
      circularSegments?: number;
  };

}
declare module 'manifold-wle/common/CSGOperation' {
  import { CSGFinalOperation } from 'manifold-wle/common/CSGFinalOperation';
  import { CSGTree } from 'manifold-wle/common/CSGTree';
  export type CSGOperation<MeshType> = CSGFinalOperation<MeshType> | CSGTree<MeshType>;

}
declare module 'manifold-wle/common/CSGPrimitive' {
  export type CSGPrimitive = {
      primitive: 'cube';
      size?: [number, number, number] | number;
      center?: boolean;
  } | {
      primitive: 'cylinder';
      height: number;
      radiusLow: number;
      radiusHigh?: number;
      circularSegments?: number;
      center?: boolean;
  } | {
      primitive: 'sphere';
      radius: number;
      circularSegments?: number;
  } | {
      primitive: 'tetrahedron';
  };

}
declare module 'manifold-wle/common/CSGTree' {
  import type { CSGGeometricOperation } from 'manifold-wle/common/CSGGeometricOperation';
  import type { CSGPrimitive } from 'manifold-wle/common/CSGPrimitive';
  export type CSGTree<MeshType> = CSGGeometricOperation<MeshType> | CSGPrimitive;

}
declare module 'manifold-wle/common/WorkerRequest' {
  import type { CSGOperation } from 'manifold-wle/common/CSGOperation';
  export type WorkerOperation = CSGOperation<[meshID: number, mesh: Mesh]>;
  export type WorkerRequest = {
      type: 'initialize';
      libraryPath: string;
  } | {
      type: 'terminate';
  } | {
      type: 'operation';
      jobID: number;
      operation: WorkerOperation;
  };

}
declare module 'manifold-wle/common/WorkerResponse' {
  export type WorkerIDMap = Array<[newID: number, originalID: number]>;
  export type WorkerResult = [mesh: Mesh, meshRelation: MeshRelation, idMap: WorkerIDMap] | boolean | number | Box | Properties | Curvature;
  export type WorkerResponse = {
      type: 'created';
  } | {
      type: 'ready';
  } | {
      type: 'terminated';
  } | {
      type: 'crash';
      error: unknown;
  } | {
      type: 'result';
      success: true;
      jobID: number;
      result: WorkerResult;
  } | {
      type: 'result';
      success: false;
      jobID: number;
      error: unknown;
  };

}
declare module 'manifold-wle/common/iterate-operation-tree' {
  import type { CSGFinalOperation } from 'manifold-wle/common/CSGFinalOperation';
  import { CSGGeometricOperation } from 'manifold-wle/common/CSGGeometricOperation';
  import type { CSGOperation } from 'manifold-wle/common/CSGOperation';
  import type { CSGPrimitive } from 'manifold-wle/common/CSGPrimitive';
  import type { CSGTree } from 'manifold-wle/common/CSGTree';
  export type OpTreeCtx<MeshType> = {
      [key: string | number]: (CSGTree<MeshType> | MeshType);
  };
  export function iterateOpTree<MeshType>(tree: CSGOperation<MeshType>, handleMesh?: ((context: OpTreeCtx<MeshType>, key: string | number, mesh: MeshType) => void) | null, handlePrimitive?: ((context: OpTreeCtx<MeshType>, key: string | number, operation: CSGPrimitive) => void) | null, handleOperation?: ((context: OpTreeCtx<MeshType>, key: string | number, operation: CSGGeometricOperation<MeshType>) => void) | null, handleTopOperation?: ((context: OpTreeCtx<MeshType>, key: string | number, topOperation: CSGFinalOperation<MeshType>) => void) | null): void;

}
declare module 'manifold-wle' {
  import main = require('manifold-wle/client');
  export = main;
}