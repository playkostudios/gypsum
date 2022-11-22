/**
 * An arbitrarily large bit array. For efficiently storing a fixed-size list of
 * booleans.
 */
export class BitArray {
    buffer: ArrayBuffer;
    view: DataView;

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

    set(index: number, value: boolean) {
        const byteOffset = index >> 3;
        let byte = this.view.getUint8(byteOffset);
        const bit = 0b1 << (index & 0b111);

        // clear, then set (if value is true)
        byte &= ~(bit);
        if (value) {
            byte |= bit;
        }

        this.view.setUint8(byteOffset, byte);
    }

    get(index: number): boolean {
        const byteOffset = index >> 3;
        const val = this.view.getUint8(byteOffset);
        return ((val >> (index & 0b111)) & 0b1) === 1;
    }

    isAllSet(): boolean {
        let wholeByteCount = this.buffer.byteLength;
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
}