import fs from "fs";
import { ApplesoftAssembler } from "../applesoft/ApplesoftAssembler";
import { ApplesoftDisassembler } from "../applesoft/ApplesoftDisassembler";
import { WaveFileGenerator } from "../audio/WaveFileGenerator";
import { WaveFileReader } from "../audio/WaveFileReader";

export class ConverterUtil {
    // Given an input path and an output path, reads the BASIC program located at the input,
    // converts it into its encoded form, and then saves it to the output path.
    static readBasicAssembleAndWrite(inPath: string, outPath: string) {
        const data = fs.readFileSync(inPath, { encoding: "utf-8" });
        const lines = data.split("\r\n");

        const assembler = new ApplesoftAssembler(lines);
        const assembled = assembler.assemble();

        fs.writeFileSync(outPath, Buffer.from(assembled));
    }

    // Given an input path and an output path, reads the BASIC program located at the input,
    // converts it into its encoded form, and then saves it to the output path.
    static readBasicAssembleAndWriteWave(
        inPath: string,
        outPath: string,
        shouldAutoRun: boolean = true
    ) {
        const data = fs.readFileSync(inPath, { encoding: "utf-8" });
        const lines = data.split("\r\n");

        const generator = new WaveFileGenerator(lines);
        generator.write(outPath, shouldAutoRun);
    }

    static readWaveAndDisassemble(inPath: string, outPathStub: string) {
        const reader = new WaveFileReader(inPath);
        const result = reader.read();

        if ("basic" in result) {
            const basicOutPath = `${outPathStub}.basic`;
            const disassembler = new ApplesoftDisassembler(result.basic);
            const basicDisassembly = disassembler.disassemble();
            fs.writeFileSync(
                basicOutPath,
                basicDisassembly.map((a) => a.fullInstruction).join("\r\n")
            );
        }

        if (result.data.length > 0) {
            const basicOutPath = `${outPathStub}.data`;
            fs.writeFileSync(basicOutPath, Buffer.from(result.data), {
                encoding: "binary",
            });
        }
    }
}
