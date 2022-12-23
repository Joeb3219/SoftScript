import { ASTNodeExpression, ASTNodeExpressionNonMath, ASTNodeFunctionCall, ASTNodeIdentifier, ASTNodeProgram, ASTNodeRoot, ASTNodeStatement, FunctionTable, VariableType } from "../parser/AST.types";
import { Parser } from "../parser/Parser";

type VariableStateEntry = {
    name: string;
    value: any | null;
    type: VariableType;
}
type VariableState = Record<string, VariableStateEntry>;
type StackFrame = {
    variables: VariableState;
    name: string;
    parent: StackFrame | null;
}

export class EvaluatorTarget {
    stackFrame: StackFrame;
    private program: ASTNodeProgram;
    private functionTable: FunctionTable;

    constructor(private readonly ast: ASTNodeRoot) {
        this.stackFrame = {
            name: Parser._GLOBAL_ROOT_NAME,
            parent: null,
            variables: {}
        };
        this.program = ast.program;
        this.functionTable = ast.functionTable;
    }

    private findVariableState(frame: StackFrame, identifier: ASTNodeIdentifier) {
        const name = identifier.token.lexeme;
        let currentFrame: StackFrame | null = frame;
        while (currentFrame) {
            if (currentFrame.variables[name]) {
                return currentFrame.variables[name];
            }

            currentFrame = currentFrame.parent;
        }
    }

    evaluateFunctionCall(frame: StackFrame, node: ASTNodeFunctionCall): any | null {
        const fnName = node.identifier.token.lexeme;
        const evaluatedArgs = node.arguments.map(arg => this.evaluateExpression(frame, arg.value));

        switch(fnName) {
            case 'print':
                console.log(...evaluatedArgs);
                return null;
            default:
                const fnEntry = this.functionTable[fnName];
                if (!fnEntry) {
                    throw new Error(`No known function by name '${fnName}', ${node.token.position.line}:${node.token.position.column}`);
                }

                if (evaluatedArgs.length !== fnEntry.parameters.length) {
                    throw new Error(`Invoking function '${fnName}' with ${evaluatedArgs.length} args, but function requires ${fnEntry.parameters.length}`);
                }

                evaluatedArgs.forEach((arg, idx) => {
                    const param = fnEntry.parameters[idx];

                    frame.variables[param.identifier] = {
                        name: param.identifier,
                        type: param.type,
                        value: arg
                    }
                })

                return this.evaluateStatements(frame, fnEntry.functionDefinitionNode?.statements ?? []);
        }
    }

    evaluateExpressionNonMath(frame: StackFrame, expression: ASTNodeExpressionNonMath): any | null {
        switch(expression.value.type) {
            case 'assignment': {
                const variableState = this.findVariableState(frame, expression.value.identifier)
                const evaluatedExpression = this.evaluateExpression(frame, expression.value.value);

                if (!variableState) {
                    throw new Error(`Attempting to assign to variable '${expression.value.identifier.token.lexeme}' before declared`);
                }

                variableState.value = evaluatedExpression;

                return evaluatedExpression;
            }
            case 'function_call':
                const fnName = expression.value.identifier.token.lexeme;
                const newFrame: StackFrame = {
                    name: fnName,
                    parent: frame,
                    variables: {}
                }

                return this.evaluateFunctionCall(newFrame, expression.value);
            case 'identifier':
                const variableState = this.findVariableState(frame, expression.value);
                if (!variableState) {
                    throw new Error('Attempting to utilize variable before definition');
                }

                return variableState.value;
            case 'number':
                return expression.value.value;

        }
    }

    evaluateExpression(frame: StackFrame, expression: ASTNodeExpression): any | null {
        switch (expression.value.type) {
            case 'expression_return':
                return this.evaluateExpression(frame, expression.value.expression);
            case 'expression_math': {
                const left = this.evaluateExpressionNonMath(frame, expression.value.left);
                const right = this.evaluateExpression(frame, expression.value.right);
                
                if (typeof left !== 'number' || typeof right !== 'number') {
                    throw new Error(`Attempting to evaluate math expression given types of ${typeof left} and ${typeof right}`);
                }

                switch (expression.value.variant) {
                    case 'add':
                        return left + right;
                    case 'subtract':
                        return left - right;
                    case 'multiply':
                        return left * right;
                    case 'power':
                        return left ** right;
                    case 'divide':
                        return left / right;
                }
            }

            case 'expression_non_math':
                return this.evaluateExpressionNonMath(frame, expression.value);
        }
    }

    evaluateStatement(frame: StackFrame, statement: ASTNodeStatement): any | null {
        switch (statement.value.type) {
            case 'expression':
                return this.evaluateExpression(frame, statement.value);
            case 'variable_definition':
                frame.variables[statement.value.identifier.token.lexeme] = {
                    name: statement.value.identifier.token.lexeme,
                    type: statement.value.paramType.whichType,
                    value: statement.value.initialValue ? this.evaluateExpression(frame, statement.value.initialValue) : null 
                }

                return frame.variables[statement.value.identifier.token.lexeme].value;
        }
    }

    evaluateStatements(frame: StackFrame, statements: ASTNodeStatement[]): any | null {
        for (const statement of statements) {
            const value = this.evaluateStatement(frame, statement);

            if (statement.value.type === 'expression' && statement.value.value.type === 'expression_return') {
                return value;
            }
        }
    }

    evaluate() {
        this.stackFrame = {
            name: Parser._GLOBAL_ROOT_NAME,
            parent: null,
            variables: {}
        };

        this.evaluateStatements(this.stackFrame, this.program.statements);
    }
}