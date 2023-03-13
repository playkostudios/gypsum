import type { EncodedSubmesh } from './EncodedSubmesh';
import type { MergeMap } from './MergeMap';

/** A {@link MeshGroup} encoded for a Manifold worker. */
export interface EncodedMeshGroup {
    mergeMap: MergeMap | null;
    submeshes: Array<EncodedSubmesh>;
}
