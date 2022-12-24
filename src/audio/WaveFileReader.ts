import fs from 'fs';
import _ from 'lodash';

type SignalState = 'high' | 'low';

type FrequencyMap = Record<number, number>;

export class WaveFileReader {
    private data: Buffer;

    private currentState: SignalState = 'high';
    private lastCrossingTime = 0;
    private currentFrequency: number = 0;
    private lastFrequency?: number = undefined;
    private sampleRate = 48000;
    private lastSignal = 0;
    private frequencyMap: FrequencyMap = {}; 
    private lastRecordedFrequency: number = 0;

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
        const data = this.data.readInt8(0x2c + time);
        if (data < 0) {
            return (128 + data) * -1;
        } else {
            return (data - 128) * -1
        }
    }

    private roundToNearest(num: number, nearest: number) {
        return Math.round(num / nearest) * nearest;
    }

    private getClosestFrequency(freq: number): number {
        const knownFrequencyes: number[] = [770, 2000, 2250, 1500, 2500, 1000];

        return _.minBy(knownFrequencyes, f => Math.abs(f - freq)) ?? 0;
    }

    private handleTimePoint(time: number) {
        const value = this.getData(time);
        const valueState: SignalState = value >= 0 ? 'high' : 'low'
        if (this.currentState !== valueState) {
            this.currentState = valueState;

            // Calculate the "real" crossing time.
            // If this point has crossed the border, the last one has, by definition, not.
            // Given a sampling rate of x, the crossing could have happened any time in the last 1/x seconds.
            // Thus, we determine how close between the previous value and the current value was, which is more likely when we crossed.
            // This works fine for regular single waves, but probably breaks for more complicated noise construction.
            const totalDistance = value - this.lastSignal;
            const distance = Math.abs(value / totalDistance);
            const fixedTime = time - distance;

            const timeSinceLastCrossing = fixedTime - this.lastCrossingTime;
            
            const secondsBetweenCrossings = 2 * timeSinceLastCrossing / this.sampleRate;
            const baseFrequency = 1 / secondsBetweenCrossings;
            
            const frequency = this.roundToNearest(
                baseFrequency//this.lastFrequency && isFinite(this.lastFrequency) ? (this.lastFrequency + baseFrequency) / 2 : baseFrequency
            , 10);
            
            const closest = this.getClosestFrequency(frequency);
            if (closest !== this.lastRecordedFrequency) {
                this.frequencyMap[time] = closest;
                this.lastRecordedFrequency = closest;
            }
            
            this.lastCrossingTime = fixedTime;
            this.lastFrequency = frequency;
        }

        this.lastSignal = value;
    }

    getInferredFrequencyAtTime(time: number): number {
        const keys = Object.keys(this.frequencyMap);
        const closestKey = _.minBy(keys, k => {
            const parsed = parseInt(k);
            return parsed > time ? Infinity : time - parsed
        });
        return closestKey ? this.frequencyMap[closestKey as any] : 0;
    }

    // Reads the bytes starting at position until we end the stream
    // Throws an error if the checksum byte fails.
    private readBytes(startingPosition: number): number[] {
        let i = startingPosition;
        const bits: number[] = [];

        while (i < this.getDataLength()) {
            const inferredFrequency = this.getInferredFrequencyAtTime(i);
            if (inferredFrequency === 770) {
                break;
            }

            if (inferredFrequency !== 2000 && inferredFrequency !== 1000) {
                throw new Error(`Found unexpected frequency when parsing bit: ${inferredFrequency}`);
            }

            bits.push(inferredFrequency === 1000 ? 1 : 0);
            const timeAdvancement =  this.sampleRate  * (inferredFrequency === 2000 ? 0.0005 : 0.001);
            console.log('advancing time by ', timeAdvancement, inferredFrequency);
            i += timeAdvancement;
        }

        if (bits.length % 8 !== 0) {
            // throw new Error(`Expected to decode a multiple of 8 bits, but decoded ${bits.length} bits`);
        }

        const bytes = _.chunk(bits, 8).map(groupBits => {
            let byte = 0;
            for (const bit of groupBits) {
                byte = (byte << 1) | bit; 
            }

            return byte;
        })

        const realBytes = _.slice(bytes, 0, bytes.length - 1);
        const checksum = _.last(bytes) ?? 0;

        const computedChecksum = realBytes.reduce((state, byte) => {
            return state ^ byte;
        }, 0);

        console.log(realBytes, checksum, computedChecksum);

        if (checksum !== computedChecksum) {
            throw new Error(`Expected checksum of ${checksum} but computed checksum of ${computedChecksum}`)
        }

        return bits;
    }

    private readProgramLength() {
        // TODO: compute this instead of hard-setting

        const bytes = this.readBytes(192022);
        console.log(bytes, bytes.length);
        return [];
    }

    read() {
        this.frequencyMap = {};
        const targettedSampleRateMs = 25;
        this.lastCrossingTime = 0;
        this.currentState = 'high';
        
        const dataLength = this.getDataLength();
        for (let i = 0; i < 400000; i ++) {
            this.handleTimePoint(i);
        }
        
       console.log(this.frequencyMap);

        const programLength = this.readProgramLength();
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