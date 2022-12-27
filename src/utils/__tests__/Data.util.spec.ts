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
});
