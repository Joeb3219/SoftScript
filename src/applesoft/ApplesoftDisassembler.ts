import { OpcodeToApplesoftInstructionMap } from "./Applesoft.types";

type ApplesoftLine = {
    nextInstructionAddress: number;
    line: number;
    dataBytes: number[];
    dataString: string;
};

export class ApplesoftDisassembler {
    constructor(private readonly bytes: number[]) {}

    private disassembleLine(bytes: number[]): ApplesoftLine {
        const dataBytes = bytes.slice(4, bytes.length - 2);

        return {
            dataBytes,
            nextInstructionAddress: (bytes[1] << 8) | bytes[0],
            line: (bytes[3] << 8) | bytes[2],
            dataString: dataBytes
                .map((c) => {
                    const opCode =
                        OpcodeToApplesoftInstructionMap[
                            c as keyof typeof OpcodeToApplesoftInstructionMap
                        ];
                    return opCode ? ` ${opCode} ` : String.fromCharCode(c);
                })
                .join("")
                .replace("  ", " ")
                .trim(),
        };
    }

    private readInt16(idx: number) {
        return (this.bytes[idx + 1] << 8) | this.bytes[idx];
    }

    disassemble() {
        let currentAddress: number = 2048;
        const disassembledLines: ApplesoftLine[] = [];
        while (
            currentAddress - 2048 < this.bytes.length &&
            currentAddress > 0
        ) {
            const idx = currentAddress - 2048;
            // First, we look at where the next instruction is located.
            const address = this.readInt16(idx);
            const instructionLength = address - currentAddress;

            const relevantBytes = this.bytes.slice(
                idx,
                idx + instructionLength
            );
            const disassembled = this.disassembleLine(relevantBytes);
            disassembledLines.push(disassembled);

            currentAddress = disassembled.nextInstructionAddress - 1;
        }

        return disassembledLines.slice(0, disassembledLines.length - 1);
    }
}
