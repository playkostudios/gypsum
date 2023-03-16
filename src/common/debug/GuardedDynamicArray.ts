import { DynamicArray } from '../DynamicArray';

import type { TypedArrayCtor, TypedArrayValue, TypedArray } from '../DynamicArray';

export class GuardedDynamicArray<TypedArrayCtorType extends TypedArrayCtor> extends DynamicArray<TypedArrayCtorType> {
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

    override set length(newLength: number) {
        this.assertPositiveIndex(newLength);
        this.assertValid();
        this.length = newLength;
    }

    override get length(): number {
        return super.length;
    }

    override get capacity(): number {
        this.assertValid();
        return this.capacity;
    }

    override expandCapacity(wantedLength: number) {
        this.assertValid();
        this.expandCapacity(wantedLength);
    }

    override pushBack(value: TypedArrayValue<TypedArrayCtorType>) {
        this.assertValid();
        const oldCapacity = this.capacity;
        this.expandCapacity(this._length + 1);
        const newCapacity = this.capacity;

        if (oldCapacity !== newCapacity) {
            console.warn('Guarded pushBack resulted in expanded capacity. Make sure to pre-allocate the needed capacity when switching to unguarded pushBack calls');
        }

        this.pushBack(value);
    }

    override get(index: number): TypedArrayValue<TypedArrayCtorType> {
        this.assertValid();
        this.assertValidIndex(index);
        return this.get(index);
    }

    override set(index: number, value: TypedArrayValue<TypedArrayCtorType>): void {
        this.assertValid();
        this.assertValidIndex(index);
        return this.set(index, value);
    }

    override slice(startIndex: number, endIndex: number): TypedArray<TypedArrayCtorType> {
        this.assertValid();
        this.assertValidPosRangeParam(startIndex);
        this.assertValidPosRangeParam(endIndex);
        this.assertValidRangeOrder(startIndex, endIndex);
        return this.slice(startIndex, endIndex);
    }

    override copy(offset: number, values: ArrayLike<TypedArrayValue<TypedArrayCtorType>>): void {
        this.assertValid();

        const valLen = values.length;
        if (valLen > 0) {
            this.assertValidIndex(offset + valLen - 1);
        }

        this.copy(offset, values);
    }

    override fill(fillValue: TypedArrayValue<TypedArrayCtorType>, startIndex?: number, endIndex?: number): void {
        this.assertValid();

        if (startIndex !== undefined) {
            this.assertValidRangeParam(startIndex);
        }
        if (endIndex !== undefined) {
            this.assertValidRangeParam(endIndex);
        }

        this.fill(fillValue, startIndex, endIndex);
    }

    override indexOf(value: TypedArrayValue<TypedArrayCtorType>, fromIndex?: number): number {
        this.assertValid();

        if (fromIndex !== undefined) {
            this.assertValidIndex(fromIndex);
        }

        return this.indexOf(value, fromIndex);
    }
}