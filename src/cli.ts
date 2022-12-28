import { program } from "commander";
import { Lexer } from "./parser/Lexer";
import { Parser } from "./parser/Parser";
import { EvaluatorTarget } from "./targets/EvaluatorTarget";
import { ConverterUtil } from "./utils/Converter.util";

program.name("Some Compiler");

program
    .command("parse")
    .argument("<file>", "Path of file to parse")
    .action((filePath) => {
        const lexer = new Lexer(filePath);
        const tokens = lexer.lex();
        const parser = new Parser(tokens);
        const ast = parser.parse();

        const evaluator = new EvaluatorTarget(ast);
        console.log(evaluator.evaluate());
    });

program
    .command("assemble")
    .description(
        "Converts a provided file containing BASIC instructions into an assembled binary"
    )
    .argument("<inPath>", "The file path of the input")
    .argument("<outPath>", "The file path of the output")
    .action((inPath, outPath) => {
        ConverterUtil.readBasicAssembleAndWrite(inPath, outPath);
    });

program
    .command("assemble-wave")
    .description(
        "Converts a provided file containing BASIC instructions into a WAVE file representing the assembled binary"
    )
    .argument("<inPath>", "The file path of the input")
    .argument("<outPath>", "The file path of the output")
    .option("--no-auto-run, -no-ar")
    .action((inPath, outPath, options) => {
        ConverterUtil.readBasicAssembleAndWriteWave(
            inPath,
            outPath,
            options.noAutoRun ? false : true
        );
    });

program
    .command("disassemble-wave")
    .description(
        "Converts a wave file into the data and BASIC data if it exists."
    )
    .argument("<inPath>", "The file path of the input")
    .argument(
        "<outPath>",
        "The file path of the output. The file path will be updated depending on the types output, e.g. BASIC outputs to <outPath>.basic, and data to <outPath>.data"
    )
    .action((inPath, outPath) => {
        ConverterUtil.readWaveAndDisassemble(inPath, outPath);
    });

program.parse();
