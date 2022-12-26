import { program } from "commander";
import { Lexer } from "./parser/Lexer";
import { Parser } from "./parser/Parser";
import { EvaluatorTarget } from "./targets/EvaluatorTarget";

program.name("Some Compiler");

program
  .command("parse")
  .argument("<file>", "Path of file to parse")
  .action((filePath) => {
    const lexer = new Lexer(filePath);
    const tokens = lexer.lex();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    // console.log(JSON.stringify(ast, null, 2));
    const evaluator = new EvaluatorTarget(ast);
    console.log(evaluator.evaluate());
  });

program.parse();
