import { OpcodeToApplesoftInstructionMap } from "./Applesoft.types";

export class ApplesoftAssembler {
    // The maximum line number permissable by AppleSoft Basic.
    // This is a maximum imposed by the machine itself.
    // See: https://mirrors.apple2.org.za/ground.icaen.uiowa.edu/Collections/1WSW/PROGRAMING.INFO.html
    private static readonly _MAX_LINE_NUMBER: number = 63_999;

    // The address that we should store our first instruction at.
    // This always seems to be 2048 from empircal testing.
    private static readonly _STARTING_ADDRESS: number = 2048;

    constructor(private readonly lines: string[]) {}

    // Converts a single line and address to the encoded representation of the instruction.
    private assembleLine(currentAddress: number, line: string): number[] {
        // Split string by whitespace, unless the substring is enclosed within quotes.
        const parts = line.match(/"[^"]*"|\S+/g);
        const [lineNumberStr, ...dataStr] = parts ?? [];
        const lineNumber = lineNumberStr ? parseInt(lineNumberStr) : -1;

        const isCommentLine = dataStr[0]?.toLowerCase() === "rem";

        if (
            lineNumber < 0 ||
            lineNumber >= ApplesoftAssembler._MAX_LINE_NUMBER
        ) {
            throw new Error(`Line number is invalid: ${lineNumber}`);
        }

        // AppleSoft BASIC uses `REM <string>` to serve as a comment within the program.
        // When a comment line is encountered, we parse the data exactly as we found it,
        // converting everything to ASCII even if it's a special word.
        // We append 0xb2 and 0x20 to the beginning as 0xb2 is the `REM` opcode, and `0x20` is a space.
        // The 0x20 between 0xb2 and the rest of the string is added to be consistent with data decoded from various archives.
        const data = isCommentLine
            ? [
                  0xb2,
                  0x20,
                  ...dataStr
                      .slice(1)
                      .join(" ")
                      .split("")
                      .map((c) => c.charCodeAt(0)),
              ]
            : // If we are not in a comment line, we map all strings to an opcode if it exists, or just parse the string into ASCII
              // bytes otherwise.
              dataStr.flatMap<number>((datum) => {
                  const foundOpcode = Object.entries(
                      OpcodeToApplesoftInstructionMap
                  ).find((e) => e[1] === datum)?.[0];

                  return foundOpcode
                      ? [parseInt(foundOpcode)]
                      : datum.split("").map((c) => c.charCodeAt(0));
              });

        // 2 bytes for the next instruction address,
        // 2 bytes for the line number
        // data.length bytes for the data,
        // and 1 byte for the 0x00 byte to end instruction.
        const numBytes = 2 + 2 + data.length + 1;
        const buffer = Buffer.alloc(numBytes);

        const nextInstructionAddress = currentAddress + numBytes + 1;

        // Write all of the data byte by byte, just like it was meant to be.
        buffer.writeUint16LE(nextInstructionAddress, 0);
        buffer.writeUint16LE(lineNumber, 2);
        for (let i = 0; i < data.length; i++) {
            buffer.writeUint8(data[i], 4 + i);
        }
        buffer.writeUint8(0x00, numBytes - 1);

        return [...buffer];
    }

    // Converts the given program into an array of little-endian bytes.
    // Format for these instructions is described here: https://www.callapple.org/vintage-apple-computers/apple-ii/applesoft-ii-pointers-tokens/
    // In a nutshell:
    // Each instruction follows the same basic structure:
    // (1) a 2 byte value describing the address of the next instruction
    // (2) a 2 byte value describing the line number (e.g. 1, 10, 50, 100, etc).
    // (3) n bytes containing the encoded instruction
    // (4) a single null byte, i.e. 0x00.
    assemble(): number[] {
        const lineBytes = this.lines.reduce<number[]>((state, line) => {
            const currentAddress =
                state.length + ApplesoftAssembler._STARTING_ADDRESS;
            const newBytes = this.assembleLine(currentAddress, line);

            return [...state, ...newBytes];
        }, []);

        // The last two bytes of the program are always 0x00.
        // This translates to a "next instruction" address of 0, ending the processing of instructions.
        return [...lineBytes, 0x00, 0x00];
    }

    // Similar to `assemble`, but instead of returning a contiguous array of all bytes,
    // returns a 2d array, where the first dimension is the index of the line that generated those instructions.
    assembleMappedToInstruction(): number[][] {
        const baseLines = this.lines.reduce<number[][]>((state, line) => {
            const currentAddress =
                state.length + ApplesoftAssembler._STARTING_ADDRESS;
            const newBytes = this.assembleLine(currentAddress, line);

            return [...state, newBytes];
        }, []);

        // The last two bytes of the program are always 0x00.
        // This translates to a "next instruction" address of 0, ending the processing of instructions.
        return [...baseLines, [0x00, 0x00]];
    }
}
