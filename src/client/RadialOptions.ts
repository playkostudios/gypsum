import type { HintOptions } from './HintOptions';

/** Optional arguments for procedural meshes with radii. */
export interface RadialOptions extends HintOptions {
    /** How many sub-divisions should there be around the radial axis? */
    subDivisions?: number;
    /** The radius around the radial axis. */
    radius?: number;
}