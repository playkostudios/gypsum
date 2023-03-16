import type { AllowedExtraMeshAttribute } from './AllowedExtraMeshAttribute';

/**
 * A set of extra (non-position) mesh attributes that are supported by Gypsum.
 * Used by MeshGroup generators for deciding which attributes need to be
 * generated.
 */
export type Hint = Set<AllowedExtraMeshAttribute>;