import { DataUtil } from "../utils/Data.util";
import { OpcodeToApplesoftInstructionMap } from "./Applesoft.types";

type ApplesoftLine = {
    // The address that the next instruction is located at.
    nextInstructionAddress: number;
    // The line number, e.g. 1, 2, 10, 50, 100, etc.
    line: number;
    // The bytes comprising the actual instruction's text
    dataBytes: number[];
    // A string representing the same data as `dataBytes`.
    dataString: string;
    // The full instruction as it would appear if you ran `LIST`.
    fullInstruction: string;
};

export class ApplesoftDisassembler {
    constructor(private readonly bytes: number[]) {}

    // Given a contiguous block of little-endian bytes, forms a human readable line
    // similar to that of what was used to generate the assembled instruction.
    disassembleLine(bytes: number[]): ApplesoftLine {
        const nextInstructionAddress = DataUtil.readInt16(bytes, 0); // 0x0-0x1
        const line = DataUtil.readInt16(bytes, 2); // 0x2-0x3

        // Excludes the last byte in the buffer (hence length - 2 rather than length - 1) because the last byte
        // is always a null byte (0x00) which is not part of the actual instruction's data.
        const dataBytes = bytes.slice(4, bytes.length - 2); // 0x4 - (n-1)

        const dataString = dataBytes
            .map((c) => {
                // AppleSoft stores opcodes beginning at 0x80 so that all ASCII characters can be preserved as typed.
                // Thus, if the byte we are decoding is in the Opcode mapping, we know it's a real Opcode.
                // Otherwise, it is a regular ASCII character that can be parsed.
                const opCode =
                    OpcodeToApplesoftInstructionMap[
                        c as keyof typeof OpcodeToApplesoftInstructionMap
                    ];
                return opCode ? ` ${opCode} ` : String.fromCharCode(c);
            })
            // There is some string hackery here: there should be at most one space between terms,
            // but some terms come pre-loaded with a space.
            // As such, when returning individual components above, we add a space on both sides, and then remove
            // all double spaces, and trim both sides.
            // There are probably easier ways to do this, but this one works fine.
            .join("")
            .replace("  ", " ")
            .trim();

        return {
            nextInstructionAddress,
            line,
            dataBytes,
            dataString,
            fullInstruction: `${line} ${dataString}`,
        };
    }

    disassemble(): ApplesoftLine[] {
        let currentAddress: number = 2048;
        const disassembledLines: ApplesoftLine[] = [];

        // Programs always begin at instruction 2048.
        // Each instruction follows the same basic structure:
        // (1) a 2 byte value describing the address of the next instruction
        // (2) a 2 byte value describing the line number (e.g. 1, 10, 50, 100, etc).
        // (3) n bytes containing the encoded instruction
        // (4) a single null byte, i.e. 0x00.
        // Given the next instruction's address, we can parse up until that address (exclusive),
        // and then parse the bytes from our current address to that end marker as a full instruction.
        // Then we can move forward to the next instruction's starting address and do it again.
        // It would have been a better design choice to just store an offset, but I am not Steve Wozniak.
        while (currentAddress - 2048 < this.bytes.length) {
            const idx = currentAddress - 2048;

            // First, we look at where the next instruction is located.
            // From this, we know how many bytes are in the current instruction since this instruction
            // is taking up all of the space between our current address and the next instruction's address.
            const address = DataUtil.readInt16(this.bytes, idx);
            const instructionLength = address - currentAddress;

            // We have reached the end, or encountered an error.
            // This _should_ happen after the last instruction is parsed:
            // the last two bytes should be 0x00 0x00, implying that the next instruction is null.
            if (address === 0 || instructionLength < 0) {
                console.debug("Reached an invalid next address", {
                    address,
                    instructionLength,
                });
                break;
            }

            const relevantBytes = this.bytes.slice(
                idx,
                idx + instructionLength
            );
            const disassembled = this.disassembleLine(relevantBytes);
            disassembledLines.push(disassembled);

            // We subtract 1 because of 0 offsets.
            currentAddress = disassembled.nextInstructionAddress - 1;
        }

        return disassembledLines;
    }
}
