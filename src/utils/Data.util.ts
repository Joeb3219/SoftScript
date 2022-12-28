import _ from "lodash";

export class DataUtil {
    // Given an index, returns the two-byte value stored beginning at this address.
    // Assumes that bytes is a contigious block of little-endian bytes.
    static readInt16(bytes: number[], index: number) {
        if (index + 1 >= bytes.length) {
            throw new Error(
                `Attempting to read two bytes beginning at index ${index}, but buffer only contains ${bytes.length}`
            );
        }

        return (bytes[index + 1] << 8) | bytes[index];
    }

    // Writes a string to a buffer in big-endian format.
    // Ensures that the buffer is exactly the requested size, even if the string is shorter.
    static createBufferedString(
        bufferLength: number,
        contents: string
    ): Buffer {
        if (contents.length > bufferLength) {
            throw new Error(
                `Attempting to put string "${contents}" into a buffer of size ${bufferLength}`
            );
        }

        const buffer = Buffer.alloc(bufferLength);
        buffer.write(contents, "utf-8");

        return buffer;
    }

    // Writes an UNSIGNED number to a buffer in little-endian format.
    // If the buffer is size 2, will write 2 bytes.
    // If the buffer is size 4, will write 4 bytes.
    // If the buffer is size 1, will write 1 byte.
    // Otherwise, throws an exception.
    static createdBufferedUnsignedNumber(
        bufferLength: number,
        contents: number
    ): Buffer {
        const buffer = Buffer.alloc(bufferLength);

        if (bufferLength === 4) {
            buffer.writeUInt32LE(contents);
        } else if (bufferLength === 2) {
            buffer.writeUInt16LE(contents);
        } else if (bufferLength === 1) {
            buffer.writeUint8(contents);
        } else {
            throw new Error(`Unexpected buffer length ${bufferLength}`);
        }

        return buffer;
    }

    // Given a series of bytes, computes the one byte checksum.
    // Unlike most checksums, Apple uses 0xFF instead of 0x00.
    // See: http://mirrors.apple2.org.za/ground.icaen.uiowa.edu/MiscInfo/Programming/cassette.format
    static computeChecksum(bytes: number[]): number {
        return bytes.reduce((state, byte) => {
            return state ^ byte;
        }, 0xff);
    }

    // Given a byte, extracts the 8 bits and returns them as individual numbers.
    // The result will be 8 numbers that are each 1 or 0.
    // Bits will be returned most significant bit (MSB) first, e.g. index 0 will be the 128's place.
    static byteToBits(
        byte: number
    ): [number, number, number, number, number, number, number, number] {
        const bits = [];
        for (let i = 0; i < 8; i++) {
            bits.push(byte & 0x1);
            byte = byte >> 1;
        }

        return bits.reverse() as any;
    }

    // Given a number, converts it to a binary string with at least minNumBits digits.
    // Used for debugging.
    static decimalToBinaryString(dec: number, minNumBits: number = 8) {
        return (dec >>> 0).toString(2).padStart(minNumBits, "0");
    }

    // Given a sequence of bytes and a checksum, validates that the bytes yield the same checksum.
    // If the checksums do not match, an error is thrown.
    static validateChecksum(bytes: number[], checksum: number) {
        const computedChecksum = DataUtil.computeChecksum(bytes);

        console.debug(
            `Validating checksum`,
            DataUtil.decimalToBinaryString(checksum),
            DataUtil.decimalToBinaryString(computedChecksum)
        );

        if (checksum !== computedChecksum) {
            throw new Error(
                `Computed checksum ${computedChecksum} does not match expected checksum ${checksum}`
            );
        }
    }

    // Given an array of bits (strictly 1/0), converts them to bytes and returns the list of bytes.
    // If there are more bits than a multiple of 8, the remaining bits are ignored.
    // Bits are added to bytes most significant bit (MSB) first.
    static bitsToBytes(bits: number[]): number[] {
        return _.chunk(bits.slice(0, Math.floor(bits.length / 8) * 8), 8).map(
            (groupBits) => {
                let byte = 0;
                for (const bit of groupBits) {
                    byte = (byte << 1) | bit;
                }

                return byte;
            }
        );
    }

    // Given an array of bits, converts them to bytes, and then verifies that the first n - 1 bytes
    // have the same checksum as the last byte.
    static bitsToBytesAndValidateChecksum(bits: number[]): number[] {
        const bytes = DataUtil.bitsToBytes(bits);

        const dataBytes = _.slice(bytes, 0, bytes.length - 1);
        const checksum = _.last(bytes) ?? 0;

        DataUtil.validateChecksum(dataBytes, checksum);

        return dataBytes;
    }
}
