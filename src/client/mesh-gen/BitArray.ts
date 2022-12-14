/**
 * An arbitrarily large bit array. For efficiently storing a fixed-size list of
 * booleans.
 *
 * - Can handle bitCounts of 0
 * - Leftover bits are not guaranteed to be 0
 * - set, get and getAndSet operations do not check the array bounds for
 *   performance reasons
 */
export class BitArray {
    buffer: ArrayBuffer;
    view: DataView;

    /**
     * Create a new BitArray which can store a given amount of bits. This will
     * create an internal ArrayBuffer with enough bytes to store the wanted
     * amount of bits. For example, 16 bits will allocate 2 bytes, and 17 bits
     * will allocate 3 bytes.
     */
    constructor(readonly bitCount: number, defaultValue = false) {
        const byteCount = Math.ceil(bitCount / 8);
        this.buffer = new ArrayBuffer(byteCount);
        this.view = new DataView(this.buffer);

        if (defaultValue) {
            for (let i = 0; i < byteCount; i++) {
                this.view.setUint8(i, 0xFF);
            }
        }
    }

    /**
     * Set a specific bit to either 0 or 1.
     *
     * @param - index The bit to set. 0 references the first bit, 7 references the 8th bit...
     * @param - value Whether to set the bit to 0 or 1. If true, then the bit is set to 1, otherwise, the bit is set to 0.
     */
    set(index: number, value: boolean): void {
        const byteOffset = index >>> 3;
        let byte = this.view.getUint8(byteOffset);
        const bit = 0b1 << (index & 0b111);

        // clear, then set (if value is true)
        byte &= ~(bit);
        if (value) {
            byte |= bit;
        }

        this.view.setUint8(byteOffset, byte);
    }

    /**
     * Get the value of a specific bit.
     *
     * @param - index The bit to set. 0 references the first bit, 7 references the 8th bit...
     * @returns false is the bit is set to 0, or true if the bit is set to 1.
     */
    get(index: number): boolean {
        const byteOffset = index >>> 3;
        const val = this.view.getUint8(byteOffset);
        return ((val >>> (index & 0b111)) & 0b1) === 1;
    }

    /**
     * Similar to calling {@link BitArray#get} and then setting the a bit with
     * {@link BitArray#set}, but more efficient.
     *
     * @param index - The bit to get and set. 0 references the first bit, 7 references the 8th bit...
     * @param value - Whether to set the bit to 0 or 1. If true, then the bit is set to 1, otherwise, the bit is set to 0.
     * @returns false is the bit was set to 0 before the set operation, or true if the bit was set to 1 before the set operation.
     */
    getAndSet(index: number, value: boolean): boolean {
        const byteOffset = index >>> 3;
        let byte = this.view.getUint8(byteOffset);
        const bit = 0b1 << (index & 0b111);

        // get old value
        const oldVal = (byte & bit) > 0;

        // clear, then set (if value is true)
        byte &= ~(bit);
        if (value) {
            byte |= bit;
        }

        this.view.setUint8(byteOffset, byte);
        return oldVal;
    }

    /**
     * Check if all the bits are set to 1.
     *
     * @returns Returns true if all bits are set to 1.
     */
    isAllSet(): boolean {
        let wholeByteCount = this.buffer.byteLength;
        if (wholeByteCount === 0) {
            return true;
        }

        const leftoverBits = this.bitCount % 8;

        if (leftoverBits !== 0) {
            wholeByteCount--;
        }

        for (let i = 0; i < wholeByteCount; i++) {
            if (this.view.getUint8(i) !== 0xFF) {
                return false;
            }
        }

        if (leftoverBits !== 0) {
            const wantedBitmask = (1 << leftoverBits) - 1;
            if ((this.view.getUint8(wholeByteCount) & wantedBitmask) !== wantedBitmask) {
                return false;
            }
        }

        return true;
    }

    /**
     * Get the index of the first occurrence of a wanted value. Similar to
     * Array.indexOf.
     *
     * @param value - The value to search. If true, then 1 will be searched, otherwise, then 0 will be searched.
     * @returns Returns the first index of a bit that has the wanted value. If no bit has the wanted value, then -1 is returned.
     */
    indexOf(value: boolean): number {
        const wholeByteCount = this.buffer.byteLength;
        if (wholeByteCount === 0) {
            return -1;
        }

        const lastByteIdx = wholeByteCount - 1;
        const leftoverBits = this.bitCount % 8;
        const leftoverBitmask = 0xFF >>> (8 - leftoverBits);

        // prepare last byte so it's easily iterable (clear leftover bits if
        // finding the first set bit, or set leftover bits if finding the first
        // clear bit)
        if (leftoverBits !== 0) {
            let lastByte = this.view.getUint8(lastByteIdx) & leftoverBitmask;
            if (!value) {
                lastByte |= ~leftoverBitmask;
            }

            this.view.setUint8(lastByteIdx, lastByte);
        }

        if (value) {
            // find first set bit
            for (let i = 0; i < wholeByteCount; i++) {
                const byte = this.view.getUint8(i);
                if (byte !== 0x00) {
                    // there's a set bit in this byte, get index
                    for (let j = 0; j < 8; j++) {
                        if (((byte >>> j) & 1) > 0) {
                            return i * 8 + j;
                        }
                    }
                }
            }
        } else {
            // find first unset bit
            for (let i = 0; i < wholeByteCount; i++) {
                const byte = this.view.getUint8(i);
                if (byte !== 0xFF) {
                    // there's a cleared bit in this byte, get index
                    for (let j = 0; j < 8; j++) {
                        if (((byte >>> j) & 1) === 0) {
                            return i * 8 + j;
                        }
                    }
                }
            }
        }

        return -1;
    }
}