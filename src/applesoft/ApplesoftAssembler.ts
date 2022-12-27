import { OpcodeToApplesoftInstructionMap } from "./Applesoft.types";
import fs from "fs";

export class ApplesoftAssembler {
    private static readonly _MAX_LINE_NUMBER: number = 65_536;
    private static readonly _STARTING_ADDRESS: number = 2048;

    constructor(private readonly lines: string[]) {}

    private assembleLine(currentAddress: number, line: string): number[] {
        const parts = line.match(/"[^"]*"|\S+/g);
        const [lineNumberStr, ...dataStr] = parts ?? [];
        const lineNumber = lineNumberStr ? parseInt(lineNumberStr) : -1;

        const isRem = dataStr[0]?.toLowerCase() === "rem";

        if (
            lineNumber < 0 ||
            lineNumber >= ApplesoftAssembler._MAX_LINE_NUMBER
        ) {
            throw new Error(`Line number is invalid: ${lineNumber}`);
        }

        const data = isRem
            ? [
                  0xb2,
                  0x20,
                  ...dataStr
                      .slice(1)
                      .join(" ")
                      .split("")
                      .map((c) => c.charCodeAt(0)),
              ]
            : dataStr.flatMap<number>((datum) => {
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

    assemble(): number[] {
        const lineBytes = this.lines.reduce<number[]>((state, line) => {
            const currentAddress =
                state.length + ApplesoftAssembler._STARTING_ADDRESS;
            const newBytes = this.assembleLine(currentAddress, line);

            return [...state, ...newBytes];
        }, []);

        // The last two bytes of the program are always 0x00.
        return [...lineBytes, 0x00, 0x00];
    }
}
