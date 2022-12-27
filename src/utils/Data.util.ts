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
}
