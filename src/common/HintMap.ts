import type { Material } from '@wonderlandengine/api';
import type { Hint } from './Hint';

/**
 * A map which assigns a {@link Hint} to a material, or any material if the key
 * is null.
 */
export type HintMap = Map<Material | null, Hint>;