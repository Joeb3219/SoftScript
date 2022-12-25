import { OpcodeToApplesoftInstructionMap } from "./Applesoft.types";

type ApplesoftLine = {
    nextInstructionAddress: number;
    line: number;
    token: string;
    data?: any;
}

export class ApplesoftDisassembler {
    constructor(private readonly bytes: number[]) {}

    private disassembleLine(bytes: number[]): ApplesoftLine {
        return {
            nextInstructionAddress: (bytes[1] << 8) | (bytes[0]),
            line: (bytes[3] << 8) | (bytes[2]),
            token: OpcodeToApplesoftInstructionMap[bytes[4] as keyof typeof OpcodeToApplesoftInstructionMap],
            data: bytes.slice(5, bytes.length - 2).map(c => String.fromCharCode(c)).join('')
        }
    }

    private readInt16(idx: number) {
        return (this.bytes[idx + 1] << 8) | (this.bytes[idx]);
    }

    disassemble() {
        let currentAddress: number = 2048;
        const disassembledLines: ApplesoftLine[] = [];
        while ((currentAddress - 2048) < this.bytes.length && currentAddress > 0) {
            const idx = currentAddress - 2048;
            // First, we look at where the next instruction is located.
            const address = this.readInt16(idx);
            const instructionLength = address - currentAddress;

            const relevantBytes = this.bytes.slice(idx, idx + instructionLength);            
            const disassembled = this.disassembleLine(relevantBytes);
            disassembledLines.push(disassembled);

            currentAddress = disassembled.nextInstructionAddress;
        }

        console.log(disassembledLines);

        return disassembledLines;
    }
}