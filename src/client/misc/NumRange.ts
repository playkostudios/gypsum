// from https://stackoverflow.com/a/70307091
type Enumerate<N extends number, Acc extends number[] = []> = Acc['length'] extends N
  ? Acc[number]
  : Enumerate<N, [...Acc, Acc['length']]>;

/**
 * Any number in the range from F to T. For example, NumRange<0, 20> represents
 * any number from 0 to 19
 *
 * @template {number} F - The start of the range
 * @template {number} T - The end of the range, exclusive
 */
type NumRange<F extends number, T extends number> = Exclude<Enumerate<T>, Enumerate<F>>;

export { NumRange };