import fs from "fs";
import _, { flatten } from "lodash";

type Sound = {
    frequency: number;
    cycles: number;
}

export class WaveFileGenerator {
    private sampleRate: number = 48000;
    private formatType: number = 1; // 1 is PCM
    private numberChannels: number = 1;
    private bitsPerSample: number = 8;
    private dataSectionHeader: string = "data";

    constructor() {}

    private getBufferWithString(bufferLength: number, contents: string): Buffer {
        const buffer = Buffer.alloc(bufferLength);
        buffer.write(contents, 'utf-8');

        return buffer;
    }

    private getBufferWithNumber(bufferLength: number, contents: number): Buffer {
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
            ...this.getBufferWithString(4, 'RIFF'), // 0-3
            ...this.getBufferWithNumber(4, fileSize - 8), // 4-7
            ...this.getBufferWithString(4, 'WAVE'), // 8-11
            ...this.getBufferWithString(4, 'fmt '), // 12-15
            ...this.getBufferWithNumber(4, 16), // 16-19
            ...this.getBufferWithNumber(2, this.formatType), // 20-21 
            ...this.getBufferWithNumber(2, this.numberChannels), // 22-23
            ...this.getBufferWithNumber(4, this.sampleRate), // 24-27
            ...this.getBufferWithNumber(4, (this.sampleRate * this.bitsPerSample * this.numberChannels) / 8), // 28-31
            ...this.getBufferWithNumber(2, (this.numberChannels * this.bitsPerSample) / 8), // 32-33
            ...this.getBufferWithNumber(2, this.bitsPerSample),  // 34-35 
            ...this.getBufferWithString(4, this.dataSectionHeader), // 36-39
            ...this.getBufferWithNumber(4, dataSizeBytes), // 40-43
        ]);
    }

    private generateRandomData(numSamples: number): Buffer {
        const buffer = Buffer.alloc(numSamples * this.numberChannels * (this.bitsPerSample / 8));

        let offset = 0;
        for (let i = 0; i < numSamples; i ++) {
            const frequency = 770;
            const amplitude = 93;

            const channel1 = Math.round(((Math.sin(frequency * (2 * Math.PI) * (i / this.sampleRate))) * amplitude)) + 128;
            
            buffer.writeUInt8(channel1, offset);
            offset += (this.bitsPerSample / 8);
        }

        return buffer;
    }

    generateSound(sound: Sound): Buffer {
        const numSamples = Math.floor(this.sampleRate * 0.0013 * sound.cycles);
        const buffer = Buffer.alloc(numSamples * this.numberChannels * (this.bitsPerSample / 8));

        let offset = 0;
        for (let i = 0; i < numSamples; i ++) {
            const amplitude = 93;

            const channel1 = Math.round(((Math.sin(sound.frequency * (2 * Math.PI) * (i / this.sampleRate))) * amplitude)) + 128;
            
            buffer.writeUInt8(channel1, offset);
            offset += (this.bitsPerSample / 8);
        }

        return buffer;
    }

    write(path: string) {
        const numberSamples = this.sampleRate * 3;
        const dataSizeBytes = numberSamples * this.numberChannels * (this.bitsPerSample / 8);

        const sounds: Sound[] = [{
            frequency: 770,
            cycles: 3000
        }, {
            frequency: 2500,
            cycles: 0.5
        }, {
            frequency: 2000,
            cycles: 0.5
        }, {
            frequency: 2500,
            cycles: 10.5
        }, {
            frequency: 2000,
            cycles: 10.5
        }, {
            frequency: 770,
            cycles: 3000
        }]

        const data = sounds.reduce((state, s) => {
            return Buffer.from([...state, ...this.generateSound(s)])
        }, Buffer.alloc(0));

        const buffer = Buffer.from([...this.getHeader(data.length),...data]);
        fs.writeFileSync(path, buffer);
    }
}