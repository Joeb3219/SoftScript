import { DataUtil } from "../Data.util";

describe("Data.util", () => {
    describe("readInt16", () => {
        it("should return the correct address when sufficient bytes are provided", () => {
            const result = DataUtil.readInt16([0xde, 0xad, 0xef, 0xbe], 2);
            expect(result).toEqual(0xbeef);
        });

        it("should throw an error if the provided index is invalid", () => {
            const executor = () =>
                DataUtil.readInt16([0xde, 0xad, 0xef, 0xbe], 3);
            expect(executor).toThrowError();
        });
    });

    describe("createBufferedString", () => {
        it("should return a correctly sized buffer when given a smaller string", () => {
            const result = DataUtil.createBufferedString(4, "lol");
            expect(result.length).toEqual(4);
            expect([...result]).toEqual([108, 111, 108, 0]);
        });

        it("should return a correctly sized buffer when given a full length string", () => {
            const result = DataUtil.createBufferedString(3, "lol");
            expect(result.length).toEqual(3);
            expect([...result]).toEqual([108, 111, 108]);
        });

        it("should throw an error when given a string longer than the buffer", () => {
            const generator = () =>
                DataUtil.createBufferedString(4, "lol_lmao");
            expect(generator).toThrowError();
        });
    });

    describe("createdBufferedUnsignedNumber", () => {
        it("should return a little endian buffer of size 1 when given a number > 0 <= 256", () => {
            const result = DataUtil.createdBufferedUnsignedNumber(1, 32);
            expect(result.length).toEqual(1);
            expect([...result]).toEqual([32]);
        });

        it("should throw an error when given a buffer of size 1 and a number < 0", () => {
            const generator = () =>
                DataUtil.createdBufferedUnsignedNumber(1, -32);
            expect(generator).toThrowError();
        });

        it("should throw an error when given a buffer of size 1 and a number > 256", () => {
            const generator = () =>
                DataUtil.createdBufferedUnsignedNumber(1, 259);
            expect(generator).toThrowError();
        });

        it("should return a little endian buffer of size 2 when given a number > 0 <= 2^16", () => {
            const result = DataUtil.createdBufferedUnsignedNumber(2, 12_987);
            expect(result.length).toEqual(2);
            expect([...result]).toEqual([187, 50]);
        });

        it("should throw an error when given a buffer of size 2 and a number < 0", () => {
            const generator = () =>
                DataUtil.createdBufferedUnsignedNumber(2, -32);
            expect(generator).toThrowError();
        });

        it("should throw an error when given a buffer of size 2 and a number > 2^16", () => {
            const generator = () =>
                DataUtil.createdBufferedUnsignedNumber(2, 170_000);
            expect(generator).toThrowError();
        });

        it("should return a little endian buffer of size 4 when given a number > 0 <= 2^32", () => {
            const result = DataUtil.createdBufferedUnsignedNumber(
                4,
                12_987_456
            );
            expect(result.length).toEqual(4);
            expect([...result]).toEqual([64, 44, 198, 0]);
        });

        it("should throw an error when given a buffer of size 4 and a number < 0", () => {
            const generator = () =>
                DataUtil.createdBufferedUnsignedNumber(4, -32);
            expect(generator).toThrowError();
        });

        it("should throw an error when given a buffer of size 4 and a number > 2^32", () => {
            const generator = () =>
                DataUtil.createdBufferedUnsignedNumber(4, 9_000_000_000);
            expect(generator).toThrowError();
        });

        it("should throw an error when given an invalid buffer size of 6", () => {
            const generator = () =>
                DataUtil.createdBufferedUnsignedNumber(6, 10);
            expect(generator).toThrowError();
        });
    });

    describe("computeChecksum", () => {
        it("should return 0xFF when given no bytes", () => {
            const result = DataUtil.computeChecksum([]);
            expect(result).toEqual(0xff);
        });

        it("should return 0x00 when given [0xFF]", () => {
            const result = DataUtil.computeChecksum([0xff]);
            expect(result).toEqual(0x00);
        });

        it("should return the expected checksum given a sequence of bytes", () => {
            const result = DataUtil.computeChecksum([0xde, 0xad, 0xbe, 0xef]);
            expect(result).toEqual(0xdd);
        });
    });

    describe("byteToBits", () => {
        it("should return the correct result", () => {
            const result = DataUtil.byteToBits(0b11001010);
            expect(result).toEqual([1, 1, 0, 0, 1, 0, 1, 0]);
        });
    });
});
