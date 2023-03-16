import type { HintMap } from '../common/HintMap';

/** Optional arguments for procedural meshes which accept hints. */
export interface HintOptions {
    /** How many sub-divisions should there be around the radial axis? */
    hints?: HintMap;
}