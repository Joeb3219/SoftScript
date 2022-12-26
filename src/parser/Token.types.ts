export type TokenType =
    | "export"
    | "type"
    | "function"
    | "number"
    | "string"
    | "boolean"
    | "left_paren"
    | "right_paren"
    | "left_curly"
    | "right_curly"
    | "colon"
    | "semi_colon"
    | "pipe"
    | "not"
    | "percent"
    | "power"
    | "ampersand"
    | "multiply"
    | "minus"
    | "plus"
    | "back_slash"
    | "forward_slash"
    | "double_quote"
    | "back_tick"
    | "single_quote"
    | "question_mark"
    | "greater_than"
    | "less_than"
    | "equal"
    | "comma"
    | "const"
    | "static"
    | "void"
    | "return"
    | "strong_equal"
    | "not_equal"
    | "number_literal"
    | "character_literal";

export type TokenPosition = {
    line: number;
    column: number;
};

export type Token<T extends TokenType = TokenType> = {
    type: T;
    lexeme: string;
    position: TokenPosition;
};

export type TokenParserFormat<T extends TokenType = TokenType> = {
    type: T;
    isExactToken(str: string): boolean;
};
