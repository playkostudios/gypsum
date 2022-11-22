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
    array: TypedArray<TypedArrayCtorType>;

    constructor(public ctor: TypedArrayCtorType, public capacity = 32) {
        this.array = new this.ctor(capacity) as TypedArray<TypedArrayCtorType>;
    }

    get length(): number {
        return this._length;
    }

    set length(newLength: number) {
        this.resizeCapacity(newLength);
        this._length = newLength;
    }

    private resizeCapacity(newCapacity: number) {
        const oldArray = this.array;
        const newBuffer = new ArrayBuffer(this.array.BYTES_PER_ELEMENT * newCapacity);
        this.array = new this.ctor(newBuffer) as TypedArray<TypedArrayCtorType>;
        this.array.set(oldArray as unknown as (ArrayLike<number> & ArrayLike<bigint>));
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

    unsafePushBack(value: TypedArrayValue<TypedArrayCtorType>) {
        this.array[this._length++] = value;
    }

    pushBack(value: TypedArrayValue<TypedArrayCtorType>) {
        this.expandCapacity(length + 1);
        this.unsafePushBack(value);
    }

    unsafeGet(index: number): TypedArrayValue<TypedArrayCtorType> {
        return this.array[index] as TypedArrayValue<TypedArrayCtorType>;
    }

    get(index: number): TypedArrayValue<TypedArrayCtorType> {
        this.assertValidIndex(index);
        return this.unsafeGet(index);
    }

    unsafeSlice(startIndex: number, endIndex: number): TypedArray<TypedArrayCtorType> {
        return this.array.slice(startIndex, endIndex) as TypedArray<TypedArrayCtorType>;
    }

    slice(startIndex: number, endIndex: number): TypedArray<TypedArrayCtorType> {
        this.assertValidPosRangeParam(startIndex);
        this.assertValidPosRangeParam(endIndex);
        this.assertValidRangeOrder(startIndex, endIndex);
        return this.unsafeSlice(startIndex, endIndex);
    }

    unsafeSet(index: number, value: TypedArrayValue<TypedArrayCtorType>): void {
        this.array[index] = value;
    }

    set(index: number, value: TypedArrayValue<TypedArrayCtorType>): void {
        this.assertValidIndex(index);
        return this.unsafeSet(index, value);
    }

    unsafeCopy(offset: number, values: ArrayLike<TypedArrayValue<TypedArrayCtorType>>): void {
        this.array.set(values as (ArrayLike<number> & ArrayLike<bigint>), offset);
    }

    copy(offset: number, values: ArrayLike<TypedArrayValue<TypedArrayCtorType>>): void {
        this.assertValidIndex(offset + values.length);
        this.unsafeCopy(offset, values);
    }

    unsafeFill(fillValue: TypedArrayValue<TypedArrayCtorType>, startIndex?: number, endIndex?: number): void {
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

    fill(fillValue: TypedArrayValue<TypedArrayCtorType>, startIndex?: number, endIndex?: number): void {
        if (startIndex !== undefined) {
            this.assertValidRangeParam(startIndex);
        }
        if (endIndex !== undefined) {
            this.assertValidRangeParam(endIndex);
        }

        this.unsafeFill(fillValue, startIndex, endIndex);
    }

    resize(newLength: number, fillValue: TypedArrayValue<TypedArrayCtorType>) {
        const oldLength = this._length;
        this.length = newLength;

        if (newLength > oldLength) {
            this.unsafeFill(fillValue, oldLength, newLength);
        }
    }
}