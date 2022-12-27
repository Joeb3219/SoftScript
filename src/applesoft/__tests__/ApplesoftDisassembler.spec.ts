import { ApplesoftAssembler } from "../ApplesoftAssembler";
import { ApplesoftDisassembler } from "../ApplesoftDisassembler";

describe("ApplesoftDisassembler", () => {
    // These tests all write to a snapshot file that is hand-verified.
    describe("disassemble", () => {
        it("should correctly handle REM instructions", () => {
            const testData = [`1 REM Eat "your" = vegetables`];
            const assembler = new ApplesoftAssembler(testData);
            const assembled = assembler.assemble();
            const disassembler = new ApplesoftDisassembler(assembled);
            const result = disassembler.disassemble();
            expect(result.map((r) => r.fullInstruction)).toEqual(testData);
            expect(result).toMatchSnapshot();
        });

        it("should correctly handle string assignment", () => {
            const testData = [`1 LET X$ = "some value"`];
            const assembler = new ApplesoftAssembler(testData);
            const assembled = assembler.assemble();
            const disassembler = new ApplesoftDisassembler(assembled);
            const result = disassembler.disassemble();
            expect(result.map((r) => r.fullInstruction)).toEqual(testData);
            expect(result).toMatchSnapshot();
        });

        it("should correctly handle multiple statements", () => {
            const testData = [
                `1 LET X$ = "some value"`,
                `2 PRINT X$`,
                `3 LET Y$ = X$ + "some other test"`,
                `4 PRINT Y$`,
                `5 GOTO 1`,
            ];
            const assembler = new ApplesoftAssembler(testData);
            const assembled = assembler.assemble();
            const disassembler = new ApplesoftDisassembler(assembled);
            const result = disassembler.disassemble();
            expect(result.map((r) => r.fullInstruction)).toEqual(testData);
            expect(result).toMatchSnapshot();
        });

        it("should return no instructions when given an invalid next address on instruction 1", () => {
            const disassembler = new ApplesoftDisassembler([
                0x00, 0x01, 0x12, 0x01, 0x00,
            ]);
            const result = disassembler.disassemble();
            expect(result).toEqual([]);
        });
    });
});
