import type { Triangle } from './Triangle';

/**
 * A list of triangle edges, encoded as a pair containing a Triangle and an edge
 * index.
 */
export type EdgeList = Array<[triangle: Triangle, edgeIdx: number]>;