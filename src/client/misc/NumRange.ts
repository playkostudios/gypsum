// from https://stackoverflow.com/a/70307091
type Enumerate<N extends number, Acc extends number[] = []> = Acc['length'] extends N
  ? Acc[number]
  : Enumerate<N, [...Acc, Acc['length']]>;
type NumRange<F extends number, T extends number> = Exclude<Enumerate<T>, Enumerate<F>>;

export { NumRange };