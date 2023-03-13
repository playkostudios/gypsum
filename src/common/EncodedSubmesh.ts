import type { AllowedExtraMeshAttribute } from './AllowedExtraMeshAttribute';

/** A {@link Submesh} encoded for a Manifold worker. */
export interface EncodedSubmesh {
    indices: Uint8Array | Uint16Array | Uint32Array | null;
    positions: Float32Array;
    extraAttributes: Array<[AllowedExtraMeshAttribute, Float32Array]>;
    materialID: number | null;
}
