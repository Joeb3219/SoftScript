import { TokenParserFormat, TokenType } from "./Token.types";

function fixedWordTokenParser(target: string): TokenParserFormat['isExactToken'] {
    return str => str === target;
}

export const TokenParserMap: { [T in TokenType]: TokenParserFormat<T> } = {
    string: {
        type: 'string',
        isExactToken: fixedWordTokenParser('string')
    },
    number: {
        type: 'number',
        isExactToken: fixedWordTokenParser('number')
    },
    boolean: {
        type: 'boolean',
        isExactToken: fixedWordTokenParser('boolean')
    },
    function: {
        type: 'function',
        isExactToken: fixedWordTokenParser('function')
    },
    export: {
        type: 'export',
        isExactToken: fixedWordTokenParser('string')
    },
    type: {
        type: 'type',
        isExactToken: fixedWordTokenParser('type')
    },
    left_paren: {
        type: 'left_paren',
        isExactToken: fixedWordTokenParser('(')
    },
    right_paren: {
        type: 'right_paren',
        isExactToken: fixedWordTokenParser(')')
    },
    left_curly: {
        type: 'left_curly',
        isExactToken: fixedWordTokenParser('{')
    },
    right_curly: {
        type: 'right_curly',
        isExactToken: fixedWordTokenParser('}')
    },
    semi_colon: {
        type: 'semi_colon',
        isExactToken: fixedWordTokenParser(';')
    },
    colon: {
        type: 'colon',
        isExactToken: fixedWordTokenParser(':')
    },
    pipe: {
        type: 'pipe',
        isExactToken: fixedWordTokenParser('|')
    },
    not: {
        type: 'not',
        isExactToken: fixedWordTokenParser('!')
    },
    strong_equal: {
        type: 'strong_equal',
        isExactToken: fixedWordTokenParser('===')
    },
    not_equal: {
        type: 'not_equal',
        isExactToken: fixedWordTokenParser('!==')
    },
    percent: {
        type: 'percent',
        isExactToken: fixedWordTokenParser('%')
    },
    power: {
        type: 'power',
        isExactToken: fixedWordTokenParser('^')
    },
    ampersand: {
        type: 'ampersand',
        isExactToken: fixedWordTokenParser('&')
    },
    multiply: {
        type: 'multiply',
        isExactToken: fixedWordTokenParser('*')
    },
    minus: {
        type: 'minus',
        isExactToken: fixedWordTokenParser('-')
    },
    plus: {
        type: 'plus',
        isExactToken: fixedWordTokenParser('+')
    },
    back_slash: {
        type: 'back_slash',
        isExactToken: fixedWordTokenParser('/')
    },
    forward_slash: {
        type: 'forward_slash',
        isExactToken: fixedWordTokenParser('\\')
    },
    double_quote: {
        type: 'double_quote',
        isExactToken: fixedWordTokenParser('"')
    },
    back_tick: {
        type: 'back_tick',
        isExactToken: fixedWordTokenParser('`')
    },
    single_quote: {
        type: 'single_quote',
        isExactToken: fixedWordTokenParser('\'')
    },
    question_mark: {
        type: 'question_mark',
        isExactToken: fixedWordTokenParser('?')
    },
    greater_than: {
        type: 'greater_than',
        isExactToken: fixedWordTokenParser('>')
    },
    less_than: {
        type: 'less_than',
        isExactToken: fixedWordTokenParser('<')
    },
    equal: {
        type: 'equal',
        isExactToken: fixedWordTokenParser('=')
    },
    const: {
        type: 'const',
        isExactToken: fixedWordTokenParser('const')
    },
    comma: {
        type: 'comma',
        isExactToken: fixedWordTokenParser(',')
    },
    static: {
        type: 'static',
        isExactToken: fixedWordTokenParser('static')
    },
    void: {
        type: 'void',
        isExactToken: fixedWordTokenParser('void')
    },
    return: {
        type: 'return',
        isExactToken: fixedWordTokenParser('return')
    },
    character_literal: {
        type: 'character_literal',
        isExactToken: str => {
            // return false;
            const match = str.match(/[a-zA-Z_$][a-zA-Z_0-9]*$/)
            return !!match && match[0].length === str.length;
        }
    },
    number_literal: {
        type: 'number_literal',
        isExactToken: str => !isNaN(parseFloat(str))
    }
}