import fs from "fs";
import { ApplesoftAssembler } from "../applesoft/ApplesoftAssembler";

type Sound = {
    frequency: number;
    cycles: number;
    invert?: boolean;
};

export class WaveFileGenerator {
    private sampleRate: number = 48000;
    private formatType: number = 1; // 1 is PCM
    private numberChannels: number = 1;
    private bitsPerSample: number = 8;
    private dataSectionHeader: string = "data";

    constructor(private readonly program: string[]) {}

    private getBufferWithString(
        bufferLength: number,
        contents: string
    ): Buffer {
        const buffer = Buffer.alloc(bufferLength);
        buffer.write(contents, "utf-8");

        return buffer;
    }

    private getBufferWithNumber(
        bufferLength: number,
        contents: number
    ): Buffer {
        const buffer = Buffer.alloc(bufferLength);

        if (bufferLength === 4) {
            buffer.writeUInt32LE(contents);
        } else if (bufferLength === 2) {
            buffer.writeUInt16LE(contents);
        }

        return buffer;
    }

    private getHeader(dataSizeBytes: number): Buffer {
        const headerSize = 44;
        const fileSize = dataSizeBytes + headerSize;

        return Buffer.from([
            ...this.getBufferWithString(4, "RIFF"), // 0-3
            ...this.getBufferWithNumber(4, fileSize - 8), // 4-7
            ...this.getBufferWithString(4, "WAVE"), // 8-11
            ...this.getBufferWithString(4, "fmt "), // 12-15
            ...this.getBufferWithNumber(4, 16), // 16-19
            ...this.getBufferWithNumber(2, this.formatType), // 20-21
            ...this.getBufferWithNumber(2, this.numberChannels), // 22-23
            ...this.getBufferWithNumber(4, this.sampleRate), // 24-27
            ...this.getBufferWithNumber(
                4,
                (this.sampleRate * this.bitsPerSample * this.numberChannels) / 8
            ), // 28-31
            ...this.getBufferWithNumber(
                2,
                (this.numberChannels * this.bitsPerSample) / 8
            ), // 32-33
            ...this.getBufferWithNumber(2, this.bitsPerSample), // 34-35
            ...this.getBufferWithString(4, this.dataSectionHeader), // 36-39
            ...this.getBufferWithNumber(4, dataSizeBytes), // 40-43
        ]);
    }

    generateSound(sound: Sound): Buffer {
        const numSamples = Math.ceil(
            this.sampleRate / (sound.frequency / sound.cycles)
        );
        const buffer = Buffer.alloc(
            numSamples * this.numberChannels * (this.bitsPerSample / 8)
        );
        const startingOffset = sound.invert
            ? Math.ceil(this.sampleRate / (sound.frequency / 0.5))
            : 0;

        let offset = 0;
        for (let i = 0; i < numSamples; i++) {
            const amplitude = 93;

            const channel1 =
                Math.sin(
                    sound.frequency *
                        (2 * Math.PI) *
                        ((i + startingOffset) / this.sampleRate)
                ) *
                    amplitude +
                128;

            buffer.writeUInt8(channel1, offset);
            offset += this.bitsPerSample / 8;
        }

        return buffer;
    }

    computeChecksum(bytes: number[]): number {
        return bytes.reduce((state, byte) => {
            return state ^ byte;
        }, 0xff);
    }

    writeProgramRecordBody(programBytes: number[]): Buffer {
        const buffer = Buffer.alloc(programBytes.length + 1);
        for (let i = 0; i < programBytes.length; i++) {
            buffer.writeUInt8(programBytes[i], i);
        }

        // Just get the first n bytes
        const checksum = this.computeChecksum(
            [...buffer].slice(0, programBytes.length)
        );

        buffer.writeUint8(checksum, buffer.length - 1);

        return buffer;
    }

    writeLengthRecordBody(
        programLength: number,
        shouldAutoRun: boolean = true
    ): Buffer {
        const buffer = Buffer.alloc(4);
        buffer.writeUInt16LE(programLength, 0);
        // 0xD5 is the BASIC Auto-Run flag.
        buffer.writeUInt8(shouldAutoRun ? 0xd5 : 0x00, 2);

        // Just get the first 3 bytes
        const checksum = this.computeChecksum([...buffer].slice(0, 3));

        buffer.writeUint8(checksum, 3);
        return buffer;
    }

    private byteToBits(byte: number): number[] {
        const bits = [];
        for (let i = 0; i < 8; i++) {
            bits.push(byte & 0x1);
            byte = byte >> 1;
        }

        return bits.reverse();
    }

    generateSoundsFromBuffer(
        buffer: Buffer,
        highFreq: boolean = false
    ): Sound[] {
        const bytes = [...buffer];
        const bits = bytes.flatMap((byte) => this.byteToBits(byte));

        return bits.map((bit) => ({
            frequency:
                bit === 1 ? (highFreq ? 6000 : 1000) : highFreq ? 12000 : 2000,
            cycles: 1,
        }));
    }

    write(path: string, shouldAutoRun: boolean = true) {
        const assembler = new ApplesoftAssembler(this.program);
        const dataBytes: number[] = [];
        const programBytes = assembler.assemble();
        const headerBuffer = this.writeLengthRecordBody(
            programBytes.length,
            shouldAutoRun
        );
        const programBuffer = this.writeProgramRecordBody(programBytes);
        const dataBuffer = this.writeProgramRecordBody(dataBytes);

        const sounds: Sound[] = [
            {
                frequency: 770,
                cycles: 3080,
            },
            {
                frequency: 2500,
                cycles: 0.5,
            },
            {
                frequency: 2000,
                cycles: 0.5,
                invert: true,
            },
            ...this.generateSoundsFromBuffer(headerBuffer),
            {
                frequency: 770,
                cycles: 3080,
            },
            {
                frequency: 2500,
                cycles: 0.5,
            },
            {
                frequency: 2000,
                cycles: 0.5,
                invert: true,
            },
            ...this.generateSoundsFromBuffer(programBuffer),
            ...this.generateSoundsFromBuffer(dataBuffer, true),
            {
                frequency: 2000,
                cycles: 10,
            },
            {
                frequency: 770,
                cycles: 10,
            },
        ];

        const soundBuffer = Buffer.concat(
            sounds.map((sound) => this.generateSound(sound))
        );
        const buffer = Buffer.concat([
            this.getHeader(soundBuffer.length),
            soundBuffer,
        ]);
        fs.writeFileSync(path, buffer);
    }
}
