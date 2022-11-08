declare module 'manifold-wle/client' {
  /// <reference path="../../../home/rafael/Projects/JS/manifold-wle/types/globals.d.ts" />
  import { CSGOperation } from 'manifold-wle/common/CSGOperation';
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
      private meshFromWLE;
      private meshToWLEArr;
      private initializeSingle;
      private initialize;
      private getBestWorker;
      dispatch(operation: CSGOperation<WL.Mesh | Mesh>, materialMap?: Map<WL.Mesh | Mesh, WL.Material>): Promise<JobResult>;
  }
  export {};

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
declare module 'manifold-wle/common/VertexHasher' {
  export default class VertexHasher {
      buckets: Map<number, Float32Array[]>;
      private murmur_32_scramble;
      private murmur3_32;
      private getHash;
      isUnique(pos: Float32Array): boolean;
      clear(): void;
  }

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