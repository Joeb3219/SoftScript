import fs from 'fs';

export class WaveFileReader {
    private data: Buffer;
    constructor(path: string) {
        this.data = fs.readFileSync(path);
        console.log(this.data);
    }

    private getDataLength() {
        return this.data.readUInt32LE(40);
    }

    private getData(time: number) {
        // const buffer = Buffer.alloc(this.getDataLength());
        // this.data.copy(buffer, 0, 0x2c, buffer.length - 0x2c);
        if ((time + 0x2c) >= this.data.length) {
            return 0;
        }
        return this.data.readInt8(0x2c + time);
    }

    getFrequencyAtTime(time: number, timeToBufferMs: number = 100) {
        const sampleRate = 48000;
        let lastState: boolean = false;
        let numFlips: number = 0;
        const timeIntervals = sampleRate * (timeToBufferMs / 1_000);

        for(let i = 0; i < timeIntervals; i ++ ){
            const val = this.getData(i + time);
            if (val > 0 && !lastState) {
                numFlips ++;
            } else if (val < 0 && lastState) {
                numFlips ++;
            }

            lastState = val > 0;
        }

        return Math.round((numFlips * (1_000 / timeToBufferMs)) / 10) * 5;
    }

    read() {
        const sampleRate = 48000;
        const targettedSampleRateMs = 25;
        
        let state: State | undefined = undefined;

        const intervalsPerStep = sampleRate * (targettedSampleRateMs / 1_000);
        const dataLength = this.getDataLength();
        for (let i = 0; i < dataLength - intervalsPerStep - 0x2c; i += intervalsPerStep) {
            const value = this.getFrequencyAtTime(i, targettedSampleRateMs * 2);

            if (value === 770 && state !== 'header') {
                state = 'header';
                console.log('Starting to hear header at ' + i +': ' +  value)
            }

            if (value === 2500 && state === 'header') {
                state = 'sync_bit';
                console.log('starting sync bit at ' + i + ': ' + value);
            }

        }
    }

}

type State = 'header' | 'sync_bit';