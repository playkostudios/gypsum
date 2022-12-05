// from https://stackoverflow.com/a/52490977

/**
 * A tuple containing N values with type T.
 *
 * @template {any} T - The type stored in this tuple.
 * @template {number} N - The number of values inside this tuple.
 */
type Tuple<T, N extends number> = N extends N ? number extends N ? T[] : _TupleOf<T, N, []> : never;

type _TupleOf<T, N extends number, R extends unknown[]> = R['length'] extends N ? R : _TupleOf<T, N, [T, ...R]>;

export { Tuple };