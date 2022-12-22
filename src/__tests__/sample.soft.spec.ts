import { describe, it, expect } from "@jest/globals";
import { Lexer } from "../parser/Lexer";
import { Parser } from '../parser/Parser';

describe('sample.soft', () => {
    it('should work', () => {
        const lexer = new Lexer('/Users/joeb3219/code/compiler/samples/sample.soft');
        const tokens = lexer.lex();
        console.log(tokens);
        const parser = new Parser(tokens);
        const ast = parser.parse();
        console.log(JSON.stringify(ast));
        expect(ast).toEqual({})
    })
})