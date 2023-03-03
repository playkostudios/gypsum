// Adapted from https://stackoverflow.com/a/65758943

/**
 * Maps a type to another type.
 *
 * @template {any} T - The input type.
 * @template {any} R - The type relation map. A type which has indices of pair, where each pair has the type [T, V], where T is the input type, and V is the output type.
 */
export type MappedType<T, R> = {
    [k in keyof R]:
        R[k] extends [T, infer P] ? P : never
}[keyof R];