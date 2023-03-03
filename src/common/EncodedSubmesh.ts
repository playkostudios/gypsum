import type { AllowedExtraMeshAttribute } from './AllowedExtraMeshAttribute';

export interface EncodedSubmesh {
    indices: Uint8Array | Uint16Array | Uint32Array | null;
    positions: Float32Array;
    extraAttributes: Array<[AllowedExtraMeshAttribute, Float32Array]>;
    materialID: number | null;
}
