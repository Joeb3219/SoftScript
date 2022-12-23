import fs from 'fs';

type SignalState = 'high' | 'low';

type FrequencyMap = Record<number, number>;

export class WaveFileReader {
    private data: Buffer;

    private currentState: SignalState = 'high';
    private lastCrossingTime = 0;
    private currentFrequency: number = 0;
    private sampleRate = 48000;
    private frequencyMap: FrequencyMap = {}; 

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

    private handleTimePoint(time: number) {
        const value = this.getData(time);
        const valueState: SignalState = value >= 0 ? 'high' : 'low'
        if (this.currentState !== valueState) {
            this.currentState = valueState;
            
            const timeSinceLastCrossing = time - this.lastCrossingTime;
            this.lastCrossingTime = time;

            const secondsBetweenCrossings = 2 * timeSinceLastCrossing / this.sampleRate;
            const frequency = 1 / secondsBetweenCrossings;

            this.frequencyMap[time] = frequency;
        }
    }

    read() {
        this.frequencyMap = {};
        const targettedSampleRateMs = 25;
        this.lastCrossingTime = 0;
        this.currentState = 'high';
        
        const dataLength = this.getDataLength();
        for (let i = 0; i < 4000; i ++) {
            this.handleTimePoint(i);
        }

        console.log(this.frequencyMap);

        // const intervalsPerStep = this.sampleRate * (targettedSampleRateMs / 1_000);
        // for (let i = 0; i < dataLength - intervalsPerStep - 0x2c; i += intervalsPerStep) {
        //     const value = this.getFrequencyAtTime(i, targettedSampleRateMs * 2);

        //     if (value === 770 && state !== 'header') {
        //         state = 'header';
        //         console.log('Starting to hear header at ' + i +': ' +  value)
        //     }

        //     if (value === 2500 && state === 'header') {
        //         state = 'sync_bit';
        //         console.log('starting sync bit at ' + i + ': ' + value);
        //     }

        // }
    }

}

type State = 'header' | 'sync_bit';