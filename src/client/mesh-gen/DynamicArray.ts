const LINEAR_CAP_GROWTH = 0x4000;
const EXP_CAPS = [ 0x20, 0x40, 0x80, 0x100, 0x200, 0x400, 0x800, 0x1000, 0x2000, 0x4000 ];
const MAX_EXP_CAP = EXP_CAPS[EXP_CAPS.length - 1];

// Adapted from https://stackoverflow.com/a/65758943 . Maps a typed array
// constructor to a typed array, because the typed array constructors are
// generic and therefore InstanceType doesn't work with them
interface TypedArrayRegistry {
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

interface TypedArrayValueRegistry {
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

export type TypedArrayCtor = Int8ArrayConstructor | Uint8ArrayConstructor | Uint8ClampedArrayConstructor | Int16ArrayConstructor | Uint16ArrayConstructor | Int32ArrayConstructor | Uint32ArrayConstructor |  Float32ArrayConstructor | Float64ArrayConstructor | BigInt64ArrayConstructor | BigUint64ArrayConstructor;

export type MappedType<T, R> = {
    [k in keyof R]:
        R[k] extends [T, infer P] ? P : never
}[keyof R]

export type TypedArray<T extends TypedArrayCtor> = MappedType<T, TypedArrayRegistry>;
export type TypedArrayValue<T extends TypedArrayCtor> = MappedType<T, TypedArrayValueRegistry>;

/**
 * A dynamic container that acts very similarly to C++ vectors. Wraps a typed
 * array. Provides safe and unsafe accessors. Unsafe accessors are faster, but
 * should only be used when your code is stable.
 */
export class DynamicArray<TypedArrayCtorType extends TypedArrayCtor> {
    private _length = 0;
    array: TypedArray<TypedArrayCtorType> | null;

    constructor(public ctor: TypedArrayCtorType, capacity = 32) {
        this.array = new this.ctor(capacity) as TypedArray<TypedArrayCtorType>;
    }

    get length(): number {
        return this._length;
    }

    set length(newLength: number) {
        this.expandCapacity(newLength);
        this._length = newLength;
    }

    setLength_guarded(newLength: number) {
        this.assertValid();
        this.length = newLength;
    }

    get capacity(): number {
        return (this.array as TypedArray<TypedArrayCtorType>).length;
    }

    getCapacity_guarded(): number {
        this.assertValid();
        return this.capacity;
    }

    private resizeCapacity(newCapacity: number) {
        const oldArray = this.array as TypedArray<TypedArrayCtorType>;
        const newBuffer = new ArrayBuffer(oldArray.BYTES_PER_ELEMENT * newCapacity);
        this.array = new this.ctor(newBuffer) as TypedArray<TypedArrayCtorType>;
        this.array.set(oldArray as unknown as (ArrayLike<number> & ArrayLike<bigint>));
    }

    private assertValid() {
        if (!this.array) {
            throw new Error('Assertion failed: array !== null');
        }
    }

    private assertPositiveIndex(index: number) {
        if (index < 0) {
            throw new Error('Assertion failed: index >= 0');
        }
    }

    private assertValidIndex(index: number) {
        this.assertPositiveIndex(index);

        if (index >= this._length) {
            throw new Error('Assertion failed: index < this.length');
        }
    }

    private assertValidRangeParam(index: number) {
        if (index > this._length) {
            throw new Error('Assertion failed: index <= this.length');
        }
    }

    private assertValidPosRangeParam(index: number) {
        this.assertPositiveIndex(index);
        this.assertValidRangeParam(index);
    }

    private assertValidRangeOrder(startIndex: number, endIndex: number) {
        if (startIndex > endIndex) {
            throw new Error('Assertion failed: startIndex <= endIndex');
        }
    }

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

    expandCapacity(wantedLength: number) {
        if (wantedLength <= this.capacity) {
            return;
        }

        this.resizeCapacity(DynamicArray.getNextCapacity(wantedLength));
    }

    expandCapacity_guarded(wantedLength: number) {
        this.assertValid();
        this.expandCapacity(wantedLength);
    }

    pushBack(value: TypedArrayValue<TypedArrayCtorType>) {
        // XXX unlike pushBack_guarded, this doesn't expand the array. it
        // assumes that the array already has enough capacity
        (this.array as TypedArray<TypedArrayCtorType>)[this._length++] = value;
    }

    pushBack_guarded(value: TypedArrayValue<TypedArrayCtorType>) {
        this.assertValid();
        const oldCapacity = this.capacity;
        this.expandCapacity(this._length + 1);
        const newCapacity = this.capacity;

        if (oldCapacity !== newCapacity) {
            console.warn('Guarded pushBack resulted in expanded capacity. Make sure to pre-allocate the needed capacity when switching to unguarded pushBack calls');
        }

        this.pushBack(value);
    }

    get(index: number): TypedArrayValue<TypedArrayCtorType> {
        return (this.array as TypedArray<TypedArrayCtorType>)[index] as TypedArrayValue<TypedArrayCtorType>;
    }

    get_guarded(index: number): TypedArrayValue<TypedArrayCtorType> {
        this.assertValid();
        this.assertValidIndex(index);
        return this.get(index);
    }

    set(index: number, value: TypedArrayValue<TypedArrayCtorType>): void {
        (this.array as TypedArray<TypedArrayCtorType>)[index] = value;
    }

    set_guarded(index: number, value: TypedArrayValue<TypedArrayCtorType>): void {
        this.assertValid();
        this.assertValidIndex(index);
        return this.set(index, value);
    }

    slice(startIndex: number, endIndex: number): TypedArray<TypedArrayCtorType> {
        return (this.array as TypedArray<TypedArrayCtorType>).slice(startIndex, endIndex) as TypedArray<TypedArrayCtorType>;
    }

    slice_guarded(startIndex: number, endIndex: number): TypedArray<TypedArrayCtorType> {
        this.assertValid();
        this.assertValidPosRangeParam(startIndex);
        this.assertValidPosRangeParam(endIndex);
        this.assertValidRangeOrder(startIndex, endIndex);
        return this.slice(startIndex, endIndex);
    }

    copy(offset: number, values: ArrayLike<TypedArrayValue<TypedArrayCtorType>>): void {
        (this.array as TypedArray<TypedArrayCtorType>).set(values as (ArrayLike<number> & ArrayLike<bigint>), offset);
    }

    copy_guarded(offset: number, values: ArrayLike<TypedArrayValue<TypedArrayCtorType>>): void {
        this.assertValid();

        const valLen = values.length;
        if (valLen > 0) {
            this.assertValidIndex(offset + valLen - 1);
        }

        this.copy(offset, values);
    }

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

    fill_guarded(fillValue: TypedArrayValue<TypedArrayCtorType>, startIndex?: number, endIndex?: number): void {
        this.assertValid();

        if (startIndex !== undefined) {
            this.assertValidRangeParam(startIndex);
        }
        if (endIndex !== undefined) {
            this.assertValidRangeParam(endIndex);
        }

        this.fill(fillValue, startIndex, endIndex);
    }

    resize(newLength: number, fillValue: TypedArrayValue<TypedArrayCtorType>) {
        const oldLength = this._length;
        this.length = newLength;

        if (newLength > oldLength) {
            this.fill(fillValue, oldLength, newLength);
        }
    }

    resize_guarded(newLength: number, fillValue: TypedArrayValue<TypedArrayCtorType>) {
        this.assertValid();
        this.assertPositiveIndex(newLength);
        this.resize(newLength, fillValue);
    }

    invalidate() {
        this.array = null;
        this._length = 0;
    }

    /**
     * Turns this DynamicArray into a typed array ready to be used by external
     * APIs. The dynamic array will be invalidated after this call.
     *
     * Creates a new typed array as a view into the same buffer as
     * {@link DynamicArray#array} ({@link DynamicArray#array} is invalidated,
     * but not the underlying buffer).
     */
    finalize(): TypedArray<TypedArrayCtorType> {
        this.assertValid();

        const oldArray = this.array as TypedArray<TypedArrayCtorType>;
        const newArray = new this.ctor(oldArray.buffer, 0, this._length) as TypedArray<TypedArrayCtorType>;

        this.invalidate();

        return newArray;
    }
}