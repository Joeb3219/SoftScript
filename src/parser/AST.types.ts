import { Token } from "./Token.types";

// export type ASTNodeType =
//     | 'root'
//     | 'program' | 'statement_list' | 'statement' | 'assignment' | 'expression_non_math' | 'expression' | 'function_call' | 'parameters' | 'math_expression'
//     | 'math_expression_subtract' | 'math_expression_add' | 'math_expression_divide' | 'math_expression_multipy' | 'math_expression_power';

export type ASTNodeIdentifier = {
    type: "identifier";
    token: Token;
};

export type VariableType = "number" | "string" | "boolean" | "void";

export type Variable = {
    identifier: string;
    type: VariableType;
};

export type FunctionTableEntry = {
    name: string;
    parameters: Variable[];
    localVariables: Variable[];
    returnType: VariableType;
    functionDefinitionNode: ASTNodeFunctionDefinition | null;
};
export type FunctionTable = Record<string, FunctionTableEntry>;

export type ASTNodeType = {
    type: "type";
    token: Token;
    whichType: "number" | "string" | "boolean" | "void";
};

export type ASTNodeNumber = {
    type: "number";
    token: Token;
    value: number;
};

export type ASTNodeAssignment = {
    type: "assignment";
    token: Token;
    identifier: ASTNodeIdentifier;
    value: ASTNodeExpression;
};

export type ASTNodeArgument = {
    type: "argument";
    token: Token;
    value: ASTNodeExpression;
};

export type ASTNodeFunctionCall = {
    type: "function_call";
    token: Token;
    identifier: ASTNodeIdentifier;
    arguments: ASTNodeArgument[];
};

export type ASTNodeExpressionNonMath = {
    type: "expression_non_math";
    token: Token;
    value:
        | ASTNodeAssignment
        | ASTNodeNumber
        | ASTNodeIdentifier
        | ASTNodeFunctionCall;
};

export type MathExpressionVariant =
    | "subtract"
    | "add"
    | "multiply"
    | "divide"
    | "power";
export type ASTNodeExpressionMath = {
    type: "expression_math";
    variant: MathExpressionVariant;
    token: Token;
    left: ASTNodeExpressionNonMath;
    right: ASTNodeExpression;
};

export type ASTNodeExpression = {
    type: "expression";
    token: Token;
    value:
        | ASTNodeExpressionMath
        | ASTNodeExpressionNonMath
        | ASTNodeReturnExpression;
};

export type ASTNodeReturnExpression = {
    type: "expression_return";
    token: Token;
    expression: ASTNodeExpression;
};

export type ASTNodeFunctionParamDefinition = {
    type: "function_param_definition";
    token: Token;
    identifier: ASTNodeIdentifier;
    paramType: ASTNodeType;
};

export type ASTNodeVariableDefinition = {
    type: "variable_definition";
    token: Token;
    identifier: ASTNodeIdentifier;
    paramType: ASTNodeType;
    initialValue?: ASTNodeExpression;
};

export type ASTNodeFunctionDefinition = {
    type: "function_defnition";
    token: Token;
    identifier: ASTNodeIdentifier;
    paramDefinitions: ASTNodeFunctionParamDefinition[];
    statements: ASTNodeStatement[];
    returnType: ASTNodeType;
};

export type ASTNodeStatement = {
    type: "statement";
    token: Token;
    value:
        | ASTNodeFunctionDefinition
        | ASTNodeExpression
        | ASTNodeVariableDefinition;
};

export type ASTNodeProgram = {
    type: "program";
    token: Token;
    statements: ASTNodeStatement[];
};

export type ASTNodeRoot = {
    type: "root";
    program: ASTNodeProgram;
    functionTable: FunctionTable;
};

// export type ASTNode2<T extends ASTNodeType = ASTNodeType> = T extends 'root' ? {
//     type: T;
//     children: ASTNode[];
// } : {
//     type: T;
//     children: ASTNode[];
// }
