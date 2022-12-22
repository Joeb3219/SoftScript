import exp from "constants";
import { ASTNodeArgument, ASTNodeAssignment, ASTNodeExpression, ASTNodeExpressionMath, ASTNodeExpressionNonMath, ASTNodeFunctionCall, ASTNodeFunctionDefinition, ASTNodeFunctionParamDefinition, ASTNodeIdentifier, ASTNodeNumber, ASTNodeProgram, ASTNodeReturnExpression, ASTNodeRoot, ASTNodeStatement, ASTNodeType, ASTNodeVariableDefinition } from "./AST.types";
import { Token, TokenType } from "./Token.types";


/*
Rough grammar:

PROGRAM: STMT_LIST
STMT_LIST: STMT e | STMT STMT_LIST
STMT: FN_DEFINITION ; | EXPRESSION ;
RETURN_EXPERSSION: return EXPRESSION
ASSIGNMENT: IDENTIFIER = EXPRESSION
EXPERSSION_NON_MATH: ASSIGNMENT | number | identifier | FN_CALL
EXPRESSION: MATH_EXPRESSION | EXPRESSION_NON_MATH | ( EXPRESSION ) | RETURN_EXPRESSION
FN_CALL: IDENTIFIER ( ARGS )
ARGS: EXPRESSION | EXPRESSION , ARGS
TYPE: boolean | number | string | void
PARAM_DEF: IDENTIFIER : TYPE
PARAM_DEF_LIST: PARAM_DEF | PARAM_DEF , PARAM_DEF_LIST
VARIABLE_DECLARATION: const IDENTIFIER : TYPE | const IDENTIFIER : TYPE = EXPRESSION

FN_DEFINITION: function IDENTIFIER () { STMST_LIST }

MATH_EXPRESSION: MATH_SUBTRACT
MATH_SUBTRACT: EXPRESSION_NON_MATH - MATH_ADD | MATH_ADD
MATH_ADD: EXPRESSION_NON_MATH + MATH_DIV | MATH_DIV
MATH_DIV: EXPRESSION_NON_MATH / MATH_MULT | MATH_MULT
MATH_MULT: EXPRESSION_NON_MATH * MATH_POWER | MATH_POWER
MATH_POWER: EXPRESSION_NON_MATH ^ EXPRESSION | EXPRESSION

*/

type FunctionReturnType<G> = G extends () => (infer A) ? A : never;

export class Parser {
    private currentTokenIndex: number;

    constructor(private readonly tokens: Token[]) {
        this.currentTokenIndex = 0;
    }

    // Util functions to work with the current token's position
    private get currentToken(): Token {
        const token = this.tokens[this.currentTokenIndex];

        if (!token) {
            throw new Error('No current token');
        }

        return token;
    }

    private lookaheadToken(offset: number = 1): Token {
        const token = this.tokens[this.currentTokenIndex + offset];

        if (!token) {
            throw new Error('No current token');
        }

        return token;
    }

    private consume() {
        const token = this.currentToken;
        this.currentTokenIndex ++;

        return token;
    }

    private consumeOfType(type: TokenType | TokenType[]): Token {
        if (Array.isArray(type) ? !type.includes(this.currentToken.type) : this.currentToken.type !== type) {
            throw new Error(`Expected token of type ${type}, but found one of type ${this.currentToken.type} @ ${this.currentToken.position.line}:${this.currentToken.position.column}`)
        } 

        return this.consume();
    }

    // Higher-order util functions for working with the rapid descent parser.
    private applyUntilFails<T>(fn: () => T): T[] {
        const results: T[] = [];

        while(true) {
            const currentTokenIndex = this.currentTokenIndex;
            try {
                results.push(fn.bind(this)());
            } catch (e) {
                console.error(e);
                this.currentTokenIndex = currentTokenIndex;
                return results;
            }
        }
    }

    
    // The Rapid Descent Parser
    private parseType(): ASTNodeType {
        const type = this.consumeOfType(['boolean', 'void', 'number', 'string']);

        return {
            type: 'type',
            token: type,
            whichType: type.type === 'boolean' ? 'boolean' : type.type === 'string' ? 'string' : type.type === 'number' ? 'number' : 'void'
        }
    }

    private parseVariableDefinition(): ASTNodeVariableDefinition {
        this.consumeOfType('const');
        const identifier = this.parseIdentifier();
        this.consumeOfType('colon');
        const paramType = this.parseType();

        if (this.currentToken.type === 'equal') {
            this.consumeOfType('equal');
            const initialValue = this.parseExpression();

            return {
                identifier,
                paramType,
                initialValue,
                token: identifier.token,
                type: 'function_param_definition'
            }
        }

        return {
            identifier,
            paramType,
            token: identifier.token,
            type: 'function_param_definition'
        }
    }

    private parseFunctionParamDefinitions(): ASTNodeFunctionParamDefinition[] {
        const rootToken = this.currentToken;
        const identifier = this.parseIdentifier();
        this.consumeOfType('colon');
        const paramType = this.parseType();

        const args: ASTNodeFunctionParamDefinition[] = [{
            identifier,
            paramType,
            type: 'function_param_definition',
            token: rootToken,
        }];

        if (this.currentToken.type === 'comma') {
            this.consumeOfType('comma');
            const remainingArgs = this.parseFunctionParamDefinitions();
            args.push(...remainingArgs);
        }

        return args;
    }

    private parseFunctionDefinition(): ASTNodeFunctionDefinition {
        console.log('evaluating fn def', this.currentToken)
        const rootToken = this.consumeOfType('function');
        const identifier = this.parseIdentifier();
        this.consumeOfType('left_paren');
        const paramDefinitions = this.parseFunctionParamDefinitions();
        this.consumeOfType('right_paren');
        this.consumeOfType('left_curly');
        const statements = this.applyUntilFails(this.parseStatement);
        this.consumeOfType('right_curly');

        return {
            identifier,
            statements,
            paramDefinitions,
            type: 'function_defnition',
            token: rootToken
        }
    }

    private parseReturn(): ASTNodeReturnExpression {
        const token = this.currentToken;
        this.consumeOfType('return');
        const expression = this.parseExpression();

        return {
            token,
            expression,
            type: 'expression_return',
        }
    }

    private parseExpressionMath(): ASTNodeExpressionMath {
        const rootToken = this.currentToken;
        const left = this.parseExpressionNonMath();
        const operand = this.consumeOfType(['multiply', 'plus', 'minus', 'forward_slash', 'power']);
        const right = this.parseExpression();

        return {
            left,
            right,
            type: 'expression_math',
            token: rootToken,
            variant: operand.type === 'minus' ? 'subtract' : operand.type === 'plus' ? 'add' : operand.type === 'multiply' ? 'multiply' : operand.type === 'forward_slash' ? 'divide' : 'power'
        }
    }

    private parseIdentifier(): ASTNodeIdentifier {
        const identifier = this.consumeOfType('character_literal');

        return {
            type: 'identifier',
            token: identifier
        }
    }

    private parseNumber(): ASTNodeNumber {
        const identifier = this.consumeOfType('number_literal');

        return {
            type: 'number',
            token: identifier,
            value: parseFloat(identifier.lexeme)
        }
    }

    private parseAssignment(): ASTNodeAssignment {
        const rootToken = this.currentToken;
        const identifier = this.parseIdentifier();
        this.consumeOfType('equal');
        const value = this.parseExpression();

        return {
            identifier,
            value,
            type: 'assignment',
            token: rootToken,
        }
    }

    private parseArgumentList(): ASTNodeArgument[] {
        const rootToken = this.currentToken;
        const expression = this.parseExpression();

        const args: ASTNodeArgument[] = [{
            type: 'argument',
            token: rootToken,
            value: expression
        }];

        if (this.currentToken.type === 'comma') {
            this.consumeOfType('comma');
            const remainingArgs = this.parseArgumentList();
            args.push(...remainingArgs);
        }

        return args;
    }

    private parseFunctionCall(): ASTNodeFunctionCall {
        const rootToken = this.currentToken;
        const identifier = this.parseIdentifier();
        this.consumeOfType('left_paren');
        const args = this.parseArgumentList();
        this.consumeOfType('right_paren');

        return {
            type: 'function_call',
            token: rootToken,
            identifier: identifier,
            arguments: args
        }
    }

    private parseExpressionNonMath(): ASTNodeExpressionNonMath {
        if (this.currentToken.type === 'character_literal') {
            if (this.lookaheadToken().type === 'equal') {
                return {
                    type: 'expression_non_math',
                    token: this.currentToken,
                    value: this.parseAssignment()
                }
            } else if(this.lookaheadToken().type === 'left_paren') {
                return {
                    type: 'expression_non_math',
                    token: this.currentToken,
                    value: this.parseFunctionCall()
                }
            } else {
                return {
                    type: 'expression_non_math',
                    token: this.currentToken,
                    value: this.parseIdentifier()
                }
            }
        }

        if (this.currentToken.type === 'number_literal') {
            return {
                type: 'expression_non_math',
                token: this.currentToken,
                value: this.parseNumber()
            }
        }

        throw new Error('Failed to parse expression non math');
    }

    private parseExpression(): ASTNodeExpression {
        console.log('Evaluating expression', this.currentToken);
        const currentToken = this.currentToken;
        switch (this.currentToken.type) {
            case 'return':
                return {
                    type: 'expression',
                    token: this.currentToken,
                    value: this.parseReturn()
                }
            case 'left_paren': {
                this.consumeOfType('left_paren');
                const expression = this.parseExpression();
                this.consumeOfType('right_paren');
                return {
                    type: 'expression',
                    token: currentToken,
                    value: expression.value
                }
            }
            case 'character_literal':
            case 'number_literal':
                const lookahead = this.lookaheadToken();
                if (
                    lookahead.type === 'multiply' || 
                    lookahead.type === 'forward_slash' ||
                    lookahead.type === 'plus' ||       
                    lookahead.type === 'minus' ||
                    lookahead.type === 'power'
                )  {
                    const expression = this.parseExpressionMath();

                    return {
                        type: 'expression',
                        token: currentToken,
                        value: expression
                    }
                }

                const expression = this.parseExpressionNonMath();

                return {
                    type: 'expression',
                    token: currentToken,
                    value: expression
                }                
        }

        throw new Error('Unable to parse expression');
    }

    private parseStatement(): ASTNodeStatement {
        console.log('parsing statement', this.currentToken);
        if (this.currentToken.type === 'function') {            
            return {
                type: 'statement',
                token: this.currentToken,
                value: this.parseFunctionDefinition()
            }
        }

        if (this.currentToken.type === 'const') {
            const value = this.parseVariableDefinition();
            
            return {
                value,
                type: 'statement',
                token: this.currentToken,
            }
        }

        const value = this.parseExpression();
        this.consumeOfType('semi_colon');

        return {
            value,
            type: 'statement',
            token: this.currentToken
        }

        throw new Error('Failed to parse statement');
    }

    private parseProgram(): ASTNodeProgram {
        return {
            type: 'program',
            token: this.currentToken,
            statements: this.applyUntilFails(this.parseStatement)
        }
    }

    parse(): ASTNodeRoot {
        this.currentTokenIndex = 0;
        const programNode = this.parseProgram();

        return {
            type: 'root',
            program: programNode
        }
    }
}