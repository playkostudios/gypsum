import type { MappedType } from './MappedType';

const START_CAP = 0x20;
const LINEAR_CAP_GROWTH = 0x4000;
const EXP_CAPS = [ START_CAP, 0x40, 0x80, 0x100, 0x200, 0x400, 0x800, 0x1000, 0x2000, 0x4000 ];
const MAX_EXP_CAP = EXP_CAPS[EXP_CAPS.length - 1];

export interface TypedArrayRegistry {
    i8: [ Int8ArrayConstructor, Int8Array ],
    u8: [ Uint8ArrayConstructor, Uint8Array ],
    uc8: [ Uint8ClampedArrayConstructor, Uint8ClampedArray ],
    i16: [ Int16ArrayConstructor, Int16Array ],
    u16: [ Uint16ArrayConstructor, Uint16Array ],
    i32: [ Int32ArrayConstructor, Int32Array ],
    u32: [ Uint32ArrayConstructor, Uint32Array ],
    i64: [ BigInt64ArrayConstructor, BigInt64Array ],
    u64: [ BigUint64ArrayConstructor, BigUint64Array ],
    f32: [ Float32ArrayConstructor, Float32Array ],
    f64: [ Float64ArrayConstructor, Float64Array ],
}

export interface TypedArrayValueRegistry {
    i8: [ Int8ArrayConstructor, number ],
    u8: [ Uint8ArrayConstructor, number ],
    uc8: [ Uint8ClampedArrayConstructor, number ],
    i16: [ Int16ArrayConstructor, number ],
    u16: [ Uint16ArrayConstructor, number ],
    i32: [ Int32ArrayConstructor, number ],
    u32: [ Uint32ArrayConstructor, number ],
    i64: [ BigInt64ArrayConstructor, bigint ],
    u64: [ BigUint64ArrayConstructor, bigint ],
    f32: [ Float32ArrayConstructor, number ],
    f64: [ Float64ArrayConstructor, number ],
}

/**
 * A type alias for any TypedArray constructor.
 */
export type TypedArrayCtor = Int8ArrayConstructor | Uint8ArrayConstructor | Uint8ClampedArrayConstructor | Int16ArrayConstructor | Uint16ArrayConstructor | Int32ArrayConstructor | Uint32ArrayConstructor |  Float32ArrayConstructor | Float64ArrayConstructor | BigInt64ArrayConstructor | BigUint64ArrayConstructor;
/**
 * The TypedArray corresponding to a given TypedArray constructor.
 *
 * @template {TypedArrayCtor} T - The TypedArray constructor.
 */
export type TypedArray<T extends TypedArrayCtor> = MappedType<T, TypedArrayRegistry>;
/**
 * The value type of a TypedArray corresponding to a given TypedArray
 * constructor.
 *
 * @template {TypedArrayCtor} T - The TypedArray constructor.
 */
export type TypedArrayValue<T extends TypedArrayCtor> = MappedType<T, TypedArrayValueRegistry>;

/**
 * A dynamic container that acts very similarly to C++ vectors. Wraps a typed
 * array. Provides safe and unsafe accessors. Unsafe accessors are faster, but
 * should only be used when your code is stable.
 */
export class DynamicArray<TypedArrayCtorType extends TypedArrayCtor> {
    protected _length = 0;
    /**
     * The actual typed array created by this dynamic array. If the dynamic
     * array has been invalidated, then this will be null.
     */
    array: TypedArray<TypedArrayCtorType> | null;

    /**
     * Create a new dynamic array from a TypedArray constructor and a starting
     * capacity.
     *
     * @param ctor - The TypedArray constructor. For example, if this dynamic array will be finalized to a Float32Array, then pass the Float32Array constructor to this parameter.
     * @param capacity - The starting capacity of the dynamic array, which is the length of the internal array.
     */
    constructor(public ctor: TypedArrayCtorType, capacity = START_CAP) {
        this.array = new this.ctor(capacity) as TypedArray<TypedArrayCtorType>;
    }

    /**
     * The length of the dynamic array. Setting this will expand the dynamic
     * array if necessary, but will not shrink.
     */
    get length(): number {
        return this._length;
    }

    set length(newLength: number) {
        this.expandCapacity(newLength);
        this._length = newLength;
    }

    /**
     * The current capacity of the dynamic array. Read-only; to expand the
     * dynamic array, call {@link DynamicArray#expandCapacity}.
     */
    get capacity(): number {
        return (this.array as TypedArray<TypedArrayCtorType>).length;
    }

    private resizeCapacity(newCapacity: number) {
        const oldArray = this.array as TypedArray<TypedArrayCtorType>;
        const newBuffer = new ArrayBuffer(oldArray.BYTES_PER_ELEMENT * newCapacity);
        this.array = new this.ctor(newBuffer) as TypedArray<TypedArrayCtorType>;
        this.array.set(oldArray as unknown as (ArrayLike<number> & ArrayLike<bigint>));
    }

    protected assertValid() {
        if (!this.array) {
            throw new Error('Assertion failed: array !== null');
        }
    }

    /**
     * Get the next capacity corresponding to an array length. For example, a
     * wanted length of 0 will return the default starting capacity of a dynamic
     * array. Capacity expands exponentially until a certain threshold, after
     * which capacity expands linearly.
     *
     * @param wantedLength - The array length used for the capacity calculations.
     */
    static getNextCapacity(wantedLength: number): number {
        if (wantedLength > MAX_EXP_CAP) {
            // linear growth
            return Math.ceil((wantedLength - MAX_EXP_CAP) / LINEAR_CAP_GROWTH) * LINEAR_CAP_GROWTH + MAX_EXP_CAP;
        } else {
            // exponential growth
            for (const newCapacity of EXP_CAPS) {
                if (newCapacity >= wantedLength) {
                    return newCapacity;
                }
            }

            // XXX this should be unreachable
            throw new Error('Impossible state; no available capacity (exponential growth)');
        }
    }

    /**
     * Expand the capacity of the dynamic array to at least fit a given wanted
     * length.
     *
     * @param wantedLength - The minimum array length that the new capacity should support.
     */
    expandCapacity(wantedLength: number) {
        if (wantedLength <= this.capacity) {
            return;
        }

        this.resizeCapacity(DynamicArray.getNextCapacity(wantedLength));
    }

    /**
     * Add an element to the end of the array. Increases the length by 1, but
     * does not expand the capacity to fit the new length, for optimisation
     * purposes. Make sure to call {@link DynamicArray#expandCapacity} before
     * calling this method.
     *
     * @param value - The value to push to the end of the array.
     */
    pushBack(value: TypedArrayValue<TypedArrayCtorType>) {
        // XXX unlike the guarded pushBack, this doesn't expand the array. it
        // assumes that the array already has enough capacity
        (this.array as TypedArray<TypedArrayCtorType>)[this._length++] = value;
    }

    /**
     * Get the value at a given index.
     *
     * @param index - The index to get.
     */
    get(index: number): TypedArrayValue<TypedArrayCtorType> {
        return (this.array as TypedArray<TypedArrayCtorType>)[index] as TypedArrayValue<TypedArrayCtorType>;
    }

    /**
     * Get the value at a given index to a given value.
     *
     * @param index - The index to set.
     * @param value - The value to set.
     */
    set(index: number, value: TypedArrayValue<TypedArrayCtorType>): void {
        (this.array as TypedArray<TypedArrayCtorType>)[index] = value;
    }

    /**
     * Calls TypedArray.slice on the internal array; copies a slice of the
     * internal array, and returns that copy.
     *
     * @param startIndex - The start index of the range.
     * @param endIndex - The end index of the range, exclusive.
     */
    slice(startIndex: number, endIndex: number): TypedArray<TypedArrayCtorType> {
        return (this.array as TypedArray<TypedArrayCtorType>).slice(startIndex, endIndex) as TypedArray<TypedArrayCtorType>;
    }

    /**
     * Calls TypedArray.set on the internal array; copies a given array of
     * values to a given offset.
     *
     * @param offset - The index to start copying to in the internal array.
     * @param values - The values to copy. All values in this array will be copied.
     */
    copy(offset: number, values: ArrayLike<TypedArrayValue<TypedArrayCtorType>>): void {
        (this.array as TypedArray<TypedArrayCtorType>).set(values as (ArrayLike<number> & ArrayLike<bigint>), offset);
    }

    /**
     * Calls TypedArray.fill on the internal array; fills the internal array
     * with a value.
     *
     * @param fillValue - The value to fill the array with.
     * @param startIndex - The start index of the range. 0 by default. Can be negative so that it's relative to the end of the array.
     * @param endIndex - The end index of the range, exclusive. By default, goes to the end of the array. Can be negative so that it's relative to the end of the array.
     */
    fill(fillValue: TypedArrayValue<TypedArrayCtorType>, startIndex?: number, endIndex?: number): void {
        // XXX undefined < 0 returns false, so its safe to cast to a number
        if ((startIndex as number) < 0) {
            startIndex = this._length + (startIndex as number);
        }

        if (endIndex === undefined) {
            endIndex = this._length;
        } else if (endIndex < 0) {
            endIndex = this._length + endIndex;
        }

        // XXX type inference fails here, pretend array is a float32array
        (this.array as Float32Array).fill(fillValue as number, startIndex, endIndex);
    }

    /** Get the index of a value in the array, or -1 if not found. */
    indexOf(value: TypedArrayValue<TypedArrayCtorType>, fromIndex?: number): number {
        // XXX type inference fails here, pretend array is a float32array
        const index = (this.array as Float32Array).indexOf(value as number, fromIndex);

        if (index >= this._length) {
            return -1;
        } else {
            return index;
        }
    }

    /**
     * Invalidates the internal array. Length will be set to 0, and further
     * operations on the dynamic array will be invalid.
     */
    invalidate() {
        this.array = null;
        this._length = 0;
    }

    /**
     * Turns this dynamic array into a TypedArray ready to be used by external
     * APIs. The dynamic array will be invalidated after this call.
     *
     * Creates a new typed array as a view into the same buffer as
     * {@link DynamicArray#array} ({@link DynamicArray#array} is invalidated,
     * but not the underlying buffer).
     *
     * @returns A TypedArray instance with the right length.
     */
    finalize(): TypedArray<TypedArrayCtorType> {
        this.assertValid();

        const oldArray = this.array as TypedArray<TypedArrayCtorType>;
        const newArray = new this.ctor(oldArray.buffer, 0, this._length) as TypedArray<TypedArrayCtorType>;

        this.invalidate();

        return newArray;
    }
}