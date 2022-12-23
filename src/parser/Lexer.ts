import fs from 'fs';
import { Token, TokenType } from './Token.types';
import { TokenParserMap } from './TokenParsers';

export class Lexer {
    private data: string;
    private readColumn: number;
    private readLine: number;

    constructor(private readonly filePath: string) {
        this.data = fs.readFileSync(filePath, 'utf-8');
        this.readColumn = -1;
        this.readLine = 0;
    }

    isWhitespace(str: string): boolean {
        return str === ' ' || str === '\t' || str === '\r';
    }

    isNewLine(str: string): boolean {
        return str === '\n';
    }

    isEndOfFile(str: string): boolean {
        return str === '\0';
    }

    readUntilDelimter(startPosition: number): string {
        let endPosition = startPosition + 1;
        while(endPosition < this.data.length) {
            const endChar = this.data[endPosition];
            if (this.isWhitespace(endChar) || this.isNewLine(endChar) || this.isEndOfFile(endChar)) {
                break;
            }

            endPosition ++;
        }

        return this.data.substring(startPosition, endPosition);
    }

    identifyToken(str: string): TokenType | undefined {
        return Object.values(TokenParserMap).find(parser => parser.isExactToken(str))?.type;
    }

    readToken(startPosition: number): Token {
        const block = this.readUntilDelimter(startPosition);

        for(let i = block.length; i > 0; i --) {
            const lexeme = block.substring(0, i);
            const tokenType = this.identifyToken(lexeme);
            
            if (tokenType) {
                return {
                    lexeme,
                    type: tokenType,
                    position: {
                        column: this.readColumn,
                        line: this.readLine
                    }
                }
            }
        }

        throw new Error(`Failed to lex file ${this.filePath} at ${this.readLine}:${this.readColumn}`);
    }

    lex(): Token[] {
        const tokens: Token[] = [];

        let i = 0;
        while (i < this.data.length) {
            const char = this.data[i];
            if (this.isWhitespace(char)) {
                i ++;
                this.readColumn ++;
                continue;
            } else if (this.isNewLine(char)) {
                i ++;
                this.readLine ++;
                this.readColumn = -1;
                continue;
            }

            this.readColumn ++;
            const token = this.readToken(i);
            tokens.push(token);
            i += token.lexeme.length;
        }

        return tokens;
    }
}