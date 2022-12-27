import { ApplesoftAssembler } from "../ApplesoftAssembler";

describe("ApplesoftAssembler", () => {
    // These tests all write to a snapshot file that is hand-verified.
    describe("assemble", () => {
        it("should correctly handle REM instructions", () => {
            const assembler = new ApplesoftAssembler([
                `1 REM Eat "your" = vegetables`,
            ]);
            const result = assembler.assemble();
            expect(result).toMatchSnapshot();
        });

        it("should correctly handle string assignment", () => {
            const assembler = new ApplesoftAssembler([
                `1 LET X$ = "some value"`,
            ]);
            const result = assembler.assemble();
            expect(result).toMatchSnapshot();
        });

        it("should correctly handle multiple statements", () => {
            const assembler = new ApplesoftAssembler([
                `1 LET X$ = "some value"`,
                `2 PRINT X$`,
                `3 LET Y$ = X$ + "some other test"`,
                `4 PRINT Y$`,
                `5 GOTO 1`,
            ]);
            const result = assembler.assemble();
            expect(result).toMatchSnapshot();
        });
    });
});
