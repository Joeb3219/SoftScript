import fs from "fs";
import _ from "lodash";
import { WaveFileGenerator } from "../audio/WaveFileGenerator";
import {
    ASTNodeExpression,
    ASTNodeExpressionNonMath,
    ASTNodeFunctionCall,
    ASTNodeIdentifier,
    ASTNodeProgram,
    ASTNodeRoot,
    ASTNodeStatement,
    FunctionTableEntry,
    VariableType,
} from "../parser/AST.types";
import { Parser } from "../parser/Parser";

type VariableStateEntry = {
    name: string;
    resolvedName: string;
    type: VariableType;
};
type VariableState = Record<string, VariableStateEntry>;
type StackFrame = {
    variables: VariableState;
    name: string;
    parent: StackFrame | null;
};
type SubroutineEntry = FunctionTableEntry & {
    address?: number;
    returnVariableName?: string;
};

const legalBasicVariables = _.range(0, 26).flatMap((first) =>
    _.range(0, 26).map(
        (second) =>
            `${String.fromCharCode(
                "A".charCodeAt(0) + first
            )}${String.fromCharCode("A".charCodeAt(0) + second)}`
    )
);

export class BasicTarget {
    stackFrame: StackFrame;
    private program: ASTNodeProgram;
    private functionTable: Record<string, SubroutineEntry>;
    private nextVariableIndex: number = 0;
    private basicStatements: string[] = [];
    private nextLineNumber: number = 0;

    constructor(ast: ASTNodeRoot) {
        this.stackFrame = {
            name: Parser._GLOBAL_ROOT_NAME,
            parent: null,
            variables: {},
        };
        this.program = ast.program;
        this.functionTable = ast.functionTable;
    }

    private getNextFreeVariable() {
        const nextVariable = legalBasicVariables[this.nextVariableIndex];
        this.nextVariableIndex++;

        return nextVariable;
    }

    private findVariableState(
        frame: StackFrame,
        identifier: ASTNodeIdentifier | string
    ) {
        const name =
            typeof identifier === "string"
                ? identifier
                : identifier.token.lexeme;
        let currentFrame: StackFrame | null = frame;
        while (currentFrame) {
            if (currentFrame.variables[name]) {
                return currentFrame.variables[name];
            }

            currentFrame = currentFrame.parent;
        }
    }

    transpileFunctionCall(
        frame: StackFrame,
        node: ASTNodeFunctionCall
    ): string | null {
        const fnName = node.identifier.token.lexeme;
        const transpiledArgs = node.arguments.map((arg) =>
            this.transpileExpression(frame, arg.value)
        );

        this.emitStatement(`REM FN CALL: '${fnName}'`);

        switch (fnName) {
            case "print":
                this.emitStatement(`PRINT ${transpiledArgs.join(",")}`);
                return null;
            default:
                const fnEntry = this.functionTable[fnName];
                if (!fnEntry) {
                    throw new Error(
                        `No known function by name '${fnName}', ${node.token.position.line}:${node.token.position.column}`
                    );
                }

                if (transpiledArgs.length !== fnEntry.parameters.length) {
                    throw new Error(
                        `Invoking function '${fnName}' with ${transpiledArgs.length} args, but function requires ${fnEntry.parameters.length}`
                    );
                }

                transpiledArgs.forEach((arg, idx) => {
                    const param = fnEntry.parameters[idx];

                    const variableState = this.findVariableState(
                        frame,
                        param.identifier
                    );
                    frame.variables[param.identifier] = {
                        name: param.identifier,
                        type: param.type,
                        resolvedName:
                            variableState?.resolvedName ??
                            this.getNextFreeVariable(),
                    };

                    this.emitStatement(
                        `LET ${
                            frame.variables[param.identifier].resolvedName
                        } = ${arg}`
                    );
                });

                this.emitStatement(`GOSUB ${fnEntry.address}`);
                return fnEntry.returnVariableName ?? null;
        }
    }

    transpileExpressionNonMath(
        frame: StackFrame,
        expression: ASTNodeExpressionNonMath
    ): string | number | boolean | null {
        switch (expression.value.type) {
            case "assignment": {
                const variableState = this.findVariableState(
                    frame,
                    expression.value.identifier
                );
                const transpiledExpression = this.transpileExpression(
                    frame,
                    expression.value.value
                );

                if (!variableState) {
                    throw new Error(
                        `Attempting to assign to variable '${expression.value.identifier.token.lexeme}' before declared`
                    );
                }

                this.emitStatement(
                    `LET ${variableState.resolvedName} = ${transpiledExpression}`
                );

                return variableState.resolvedName;
            }
            case "function_call":
                const fnName = expression.value.identifier.token.lexeme;
                const newFrame: StackFrame = {
                    name: fnName,
                    parent: frame,
                    variables: {},
                };

                return this.transpileFunctionCall(newFrame, expression.value);
            case "identifier":
                const variableState = this.findVariableState(
                    frame,
                    expression.value
                );
                if (!variableState) {
                    throw new Error(
                        `Attempting to utilize variable ${expression.value.token.lexeme} before definition`
                    );
                }

                return variableState.resolvedName;
            case "number":
                return expression.value.value;
        }
    }

    transpileExpression(
        frame: StackFrame,
        expression: ASTNodeExpression
    ): string | number | boolean | null {
        switch (expression.value.type) {
            case "expression_return":
                const expressionResult = this.transpileExpression(
                    frame,
                    expression.value.expression
                );
                const fnEntry = this.functionTable[frame.name];

                if (!fnEntry) {
                    throw new Error("Return statement outside of a function");
                }

                if (fnEntry.returnVariableName) {
                    this.emitStatement(
                        `REM Return value assigned to return variable`
                    );
                    this.emitStatement(
                        `LET ${fnEntry.returnVariableName} = ${expressionResult}`
                    );
                }

                this.emitStatement(`RETURN`);

                return fnEntry.returnVariableName ?? null;
            case "expression_math": {
                const left = this.transpileExpressionNonMath(
                    frame,
                    expression.value.left
                );
                const right = this.transpileExpression(
                    frame,
                    expression.value.right
                );

                const resultVariable = this.getNextFreeVariable();
                switch (expression.value.variant) {
                    case "add":
                        this.emitStatement(
                            `LET ${resultVariable} = ${left} + ${right}`
                        );
                        return resultVariable;
                    case "subtract":
                        this.emitStatement(
                            `LET ${resultVariable} = ${left} - ${right}`
                        );
                        return resultVariable;
                    case "multiply":
                        this.emitStatement(
                            `LET ${resultVariable} = ${left} * ${right}`
                        );
                        return resultVariable;
                    case "power":
                        this.emitStatement(
                            `LET ${resultVariable} = ${left} ^ ${right}`
                        );
                        return resultVariable;
                    case "divide":
                        this.emitStatement(
                            `LET ${resultVariable} = ${left} / ${right}`
                        );
                        return resultVariable;
                }
            }

            case "expression_non_math":
                return this.transpileExpressionNonMath(frame, expression.value);
        }
    }

    transpileStatement(frame: StackFrame, statement: ASTNodeStatement) {
        switch (statement.value.type) {
            case "expression":
                this.transpileExpression(frame, statement.value);
                return;
            case "variable_definition":
                const variableName = statement.value.identifier.token.lexeme;
                const resolvedName = this.getNextFreeVariable();
                frame.variables[variableName] = {
                    resolvedName,
                    name: variableName,
                    type: statement.value.paramType.whichType,
                };

                if (statement.value.initialValue) {
                    const expressionResult = this.transpileExpression(
                        frame,
                        statement.value.initialValue
                    );
                    this.emitStatement(
                        `LET ${resolvedName} = ${expressionResult}`
                    );
                } else {
                    this.emitStatement(`LET ${resolvedName} = NIL`);
                }

                return resolvedName;
            case "function_defnition":
                const fnEntry =
                    this.functionTable[statement.value.identifier.token.lexeme];

                if (!fnEntry) {
                    throw new Error("Internal fault");
                }

                fnEntry.parameters.forEach((param) => {
                    frame.variables[param.identifier] = {
                        name: param.identifier,
                        resolvedName: this.getNextFreeVariable(),
                        type: param.type,
                    };
                });

                fnEntry.returnVariableName = this.getNextFreeVariable();
                const firstStatementAddy = this.emitStatement(
                    `REM '${fnEntry.name}' FN`
                );
                fnEntry.address = firstStatementAddy;
                this.transpileStatements(
                    {
                        name: fnEntry.name,
                        parent: frame,
                        variables: {},
                    },
                    statement.value.statements
                );
        }
    }

    transpileStatements(
        frame: StackFrame,
        statements: ASTNodeStatement[]
    ): number {
        let firstRealStatement: number | undefined;
        for (const statement of statements) {
            const mostRecentStatement = this.basicStatements.length - 1;
            this.transpileStatement(frame, statement);

            const firstNewStatement =
                this.basicStatements[mostRecentStatement + 1];
            const firstNewAddy = firstNewStatement
                ? parseInt(firstNewStatement.split(" ")[0] ?? "0")
                : undefined;

            if (
                statement.value.type !== "function_defnition" &&
                firstRealStatement === undefined &&
                firstNewAddy !== undefined
            ) {
                firstRealStatement = firstNewAddy;
            }
        }

        return firstRealStatement ?? 0;
    }

    private emitStatement(statement: string): number {
        const instrNum = this.nextLineNumber;
        const fullStatement = `${instrNum} ${statement}`;
        this.basicStatements.push(fullStatement);

        this.nextLineNumber += 5;

        return instrNum;
    }

    transpile(path: string) {
        this.stackFrame = {
            name: Parser._GLOBAL_ROOT_NAME,
            parent: null,
            variables: {},
        };
        this.basicStatements = [];
        this.nextLineNumber = 5;

        const firstAddy = this.transpileStatements(
            this.stackFrame,
            this.program.statements
        );
        this.basicStatements = [
            `0 HOME`,
            `1 GOTO ${firstAddy}`,
            ...this.basicStatements,
        ];

        if (path.toLowerCase().endsWith(".wav")) {
            const waveGenerator = new WaveFileGenerator(this.basicStatements);
            waveGenerator.write(path, false);
        } else {
            fs.writeFileSync(path, this.basicStatements.join("\r\n"));
        }
    }
}
