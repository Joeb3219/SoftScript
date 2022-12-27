import { describe, it, expect } from "@jest/globals";
import _ from "lodash";
import { ApplesoftAssembler } from "../applesoft/ApplesoftAssembler";
import { ApplesoftDisassembler } from "../applesoft/ApplesoftDisassembler";
import { WaveFileGenerator } from "../audio/WaveFileGenerator";
import { WaveFileReader } from "../audio/WaveFileReader";
import { Lexer } from "../parser/Lexer";
import { Parser } from "../parser/Parser";
import { BasicTarget } from "../targets/BasicTarget";
import { EvaluatorTarget } from "../targets/EvaluatorTarget";
import fs from "fs";

describe("sample.soft", () => {
    it("should work", () => {
        const lexer = new Lexer(
            "/Users/joeb3219/code/compiler/samples/sample.soft"
        );
        const tokens = lexer.lex();
        console.log(tokens);
        const parser = new Parser(tokens);
        const ast = parser.parse();
        const evaluator = new BasicTarget(ast);
        evaluator.transpile("/Users/joeb3219/Downloads/basicprogram.wav");
        expect([4]).toEqual({});
    });

    it("should generate a wave file", () => {
        const statements = _.range(0, 25).map((i) => `${i} PRINT ${i}`);
        const gen = new WaveFileGenerator(statements);
        gen.write("/Users/joeb3219/Downloads/some.wav");
    });

    it("should read that wave file", () => {
        const f =
            2 === 1 + 3
                ? "/Users/joeb3219/Downloads/some.wav"
                : "/Users/joeb3219/Downloads/tetris.hi.wav";
        const foo = new WaveFileReader(f);
        const x = foo.read();
        expect(x).toEqual(0);
    });

    it("should disassemble", () => {
        const foo = new ApplesoftDisassembler([
            0x14, 0x08, 0x01, 0x00, 0xba, 0x22, 0x48, 0x45, 0x4c, 0x4c, 0x4f,
            0x20, 0x57, 0x4f, 0x52, 0x4c, 0x44, 0x22, 0x00, 0x2d, 0x08, 0x02,
            0x00, 0xba, 0x22, 0x57, 0x48, 0x41, 0x54, 0x20, 0x49, 0x53, 0x20,
            0x47, 0x4f, 0x49, 0x4e, 0x47, 0x20, 0x4f, 0x4e, 0x3f, 0x22, 0x00,
            0x34, 0x08, 0x03, 0x00, 0xab, 0x31, 0x00, 0x00, 0x00,
        ]);
        const x = foo.disassemble();
        expect(x).toEqual(0);
    });

    it("333bahahaha2", () => {
        console.log("lol");
        const f = fs.readFileSync(
            "/Users/joeb3219/Downloads/basicprogram.txt",
            { encoding: "utf-8" }
        );
        const g = fs.readFileSync("/Users/joeb3219/Downloads/out.txt");
        const foo = new ApplesoftAssembler(f.split("\r\n"));
        const x = foo.assemble();
        fs.writeFileSync(
            "/Users/joeb3219/Downloads/out_my.txt",
            Buffer.from(x)
        );

        console.log(x);
        expect(x).toEqual([...g]);
    });
});
