import fs from 'fs';
import _, { isInteger } from 'lodash';

type SignalState = 'high' | 'low';

type FrequencyMap = Record<number, number>;

type BasicAndDataStore = {data: number[] } | { data: number[]; basic: number[] };

export class WaveFileReader {
    private data: Buffer;

    private currentState: SignalState = 'high';
    private lastCrossingTime = 0;
    private currentFrequency: number = 0;
    private lastFrequency?: number = undefined;
    private optimizedFrequencyMap: Record<number, number> = {};
    private sampleRate = 48_000;
    private lastSignal = 0;
    private frequencyMap: FrequencyMap = {}; 
    private lastRecordedFrequency: number = 0;
    private static _TIME_INCREMENT_INTERVAL = 1;

    constructor(path: string) {
        this.data = fs.readFileSync(path);

        this.sampleRate = this.data.readUint16LE(0x18);
        console.log('sample rate', this.sampleRate);

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
        const knownFrequencyes: number[] = [770, 2000, 2250, 1500, 2500, 1000, 12000, 6000];

        const min = _.minBy(knownFrequencyes, f => Math.abs(f - freq)) ?? 0;
        const dist = freq - min;
        if (dist > 250) {
            return freq;
        }

        return min;
    }

    private interpolateData(time: number) {
        if (_.isInteger(time)) {
            return this.getData(time);
        }

        // find the value at the previous time step, and the next, and then compute the movement between them.
        const prevTime = _.floor(time);
        const nextTime = _.ceil(time);
        const previous = this.getData(prevTime);
        const next = this.getData(nextTime);

        // Find the distance between them.
        const distance = next - previous;
        
        // And now we add our fractional part of this distance
        // If t is 1.5, and v = 10 at 1 and v = 20 and 2,
        // we find a distance of 10, and thus 10 * 0.5 = 5,
        // ergo we return 10 + 5 = 15.
        // If t is 1.5, and v = 10 at 1 and v = -20 at 2,
        // we find a distance of -30, and thus -30 * 0.5 = -15,
        // ergo we return 10 + -15 = -5.
        const fraction = time - prevTime;
        const fractionalDistance = distance * fraction;

        // console.log(time, previous, next, fraction, fractionalDistance);

        return previous + fractionalDistance;
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

            if (!isFinite(frequency)) {
                // console.log('infinite frequency at ' + time, timeSinceLastCrossing, secondsBetweenCrossings);
                return;
            }

            if (closest !== this.lastRecordedFrequency) {
                const startOfWave = Math.ceil(this.sampleRate / (closest / 0.5)) - 1;
                // console.log('start of wave was delta' + startOfWave, closest, time)
                const timeCandidate = time - startOfWave;
                this.frequencyMap[timeCandidate > 0 ? timeCandidate : time] = closest;
                this.lastRecordedFrequency = closest;
            }
            
            this.lastCrossingTime = fixedTime;
            this.lastFrequency = frequency;
        }

        this.lastSignal = value;
    }

    getInferredFrequencyAtTime(time: number): number {
        const key = this.optimizedFrequencyMap[time];
        return this.frequencyMap[key];
        // const keys = Object.keys(this.frequencyMap);
        // const closestKey = _.minBy(keys, k => {
        //     const parsed = parseInt(k);
        //     return parsed > time ? Infinity : time - parsed
        // });
        // return closestKey ? this.frequencyMap[closestKey as any] : 0;
    }

    private dec2bin(dec: number) {
        return (dec >>> 0).toString(2).padStart(8, '0');
      }

    private validateChecksum(bytes: number[], checksum: number) {
        const computedChecksum = bytes.reduce((state, byte) => {
            return state ^ byte;
            // Unlike most checksums, Apple uses 0xFF instead of 0x00.
            // See: http://mirrors.apple2.org.za/ground.icaen.uiowa.edu/MiscInfo/Programming/cassette.format
        }, 0xFF);

        console.log(`Validating checksum`, this.dec2bin(checksum), this.dec2bin(computedChecksum));

        if (checksum !== computedChecksum) {
            throw new Error(`Computed checksum ${computedChecksum} does not match expected checksum ${checksum}`)
        }
    }

    private convertBitsToBytes(bits: number[]): number[] {
        return _.chunk(bits.slice(0, Math.floor(bits.length / 8) * 8), 8).map(groupBits => {
            let byte = 0;
            for (const bit of groupBits) {
                byte = (byte << 1) | bit; 
            }

            return byte;
        })
    }

    private getBytesFromBits(bits: number[], byteLength?: number): BasicAndDataStore {
        if (byteLength) {
            const bitsNeededForBasicAndChecksum = (byteLength + 2) * 8;
            const bytes = this.convertBitsToBytes(bits.slice(0, bitsNeededForBasicAndChecksum));

            const basicRealBytes = _.slice(bytes, 0, bytes.length - 1);
            const basicChecksum = _.last(bytes) ?? 0;
    
            this.validateChecksum(basicRealBytes, basicChecksum);

            const dataBytes = this.convertBitsToBytes(bits.slice(bitsNeededForBasicAndChecksum + 5, bits.length));
            const dataRealBytes = _.slice(dataBytes, 0, dataBytes.length - 1);
            const dataChecksum = _.last(dataBytes) ?? 0;
    
            this.validateChecksum(dataRealBytes, dataChecksum);


            // Read the first n bytes
            return { data: dataRealBytes, basic: basicRealBytes };
        } 

        const bytes = this.convertBitsToBytes(bits);
        const realBytes = _.slice(bytes, 0, bytes.length - 1);
        const checksum = _.last(bytes) ?? 0;
            
        this.validateChecksum(realBytes, checksum);

        return { data: realBytes };
    }

    // Reads the bytes starting at position until we end the stream
    // Throws an error if the checksum byte fails.
    private readBytes(startingPosition: number, byteLength?: number): BasicAndDataStore {
        let i = startingPosition;
        const bits: number[] = [];

        console.log('starting position', startingPosition);
        while (i < this.getDataLength()) {
            const inferredFrequency = this.getInferredFrequencyAtTime(i);

            if (inferredFrequency === 770 || inferredFrequency === -1 || inferredFrequency === 2500) {
                console.log('found header frequency', i);
                break;
            }

            if (inferredFrequency !== 2000 && inferredFrequency !== 1000 && inferredFrequency !== 12000 && inferredFrequency !== 6000) {
                throw new Error(`Found unexpected frequency when parsing bit: ${inferredFrequency}`);
            }

            const isOne = inferredFrequency === 1000 || inferredFrequency === 6000;
            bits.push(isOne ? 1 : 0);
            const timeAdvancement = Math.ceil(this.sampleRate  * (inferredFrequency === 2000 ? 0.0005 : inferredFrequency === 1000 ? 0.001 : inferredFrequency === 12000 ? (0.001/12) : (0.001/6)));
            i += timeAdvancement;

            // if (byteLength && (bits.length + 8) > (byteLength * 8)) {
            //     console.log('Have read ' + bits.length + ' bits and therefore checking checksum');
            //     break;
            // }
        }

        if (bits.length % 8 !== 0) {
            // throw new Error(`Expected to decode a multiple of 8 bits, but decoded ${bits.length} bits`);
        }

        const realBytes = this.getBytesFromBits(bits, byteLength);
        console.log(realBytes, realBytes.data.length, 'basic' in realBytes ? realBytes.basic : 0, bits.length);

        return realBytes;
    }

    private getLengthStart(which: number = 0) {
        const headerKeys = Object.entries(this.frequencyMap).filter(entry => {
            if (entry[1] === 770) return true;
        }).map(entry => parseInt(entry[0]));

        const afterKey = headerKeys[which];
        const startRange = Object.entries(this.frequencyMap).find(entry => {
            if (entry[1] === 2500 && parseInt(entry[0]) >= afterKey) return true
        })?.[0];
        const startKey = parseInt(startRange ?? '0');
        
        return startKey + 24;
    }

    private readProgram() {
        const programLength = this.readProgramLength();
        console.log('PROGRAM IS OF LENGTH ' + programLength);
        // 1 extra for the checksum
        const bytes = this.readBytes(this.getLengthStart(1), programLength);

        console.log(bytes);
        return bytes;
    }

    private readProgramLength() {
        // console.log('start', this.getLengthStart());
        const bytes = this.readBytes(this.getLengthStart(0)).data;

        const length = (bytes[1] << 8) | bytes[0];
        // for(const byte of bytes.reverse().slice(0, 2)) {
        //     console.log('appending ' + byte + ' to ' + length)
        //     length = (length << 8) | byte;
        // }

        console.log(bytes, bytes.length);
        console.log('Program is of length ' + length, length ^ 0xFFFFFF, this.dec2bin(length));
        return length;
    }

    private writeBinaryDump(bytes: BasicAndDataStore) {
        const allBytes = [...bytes.data, ...('basic' in bytes ? bytes.basic : [])]
        const buff = Buffer.alloc(allBytes.length);
        allBytes.forEach((b, idx) => buff.writeUInt8(b, idx));
        fs.writeFileSync('/Users/joeb3219/Downloads/binary.dump', buff);
    }

    private computeOptimizedFrequencyMap() {
        const keys = Object.keys(this.frequencyMap);
        const sortedKeys = _.sortBy(keys);
        const map: Record<number, number> = {};
        
        let currentKeyIndex = 0;
        const range = _.range(0, this.getDataLength())        
        for (const i of range) {
            while (true) {
                const currentCandidateKey = parseInt(sortedKeys[currentKeyIndex]);
                const nextCandidateKey = parseInt(sortedKeys[currentKeyIndex + 1]);    

                if (nextCandidateKey < i) {
                    currentKeyIndex ++;
                } else {
                    map[i] = currentCandidateKey;
                    break;
                }
            }
        }

        // const keys = Object.keys(this.frequencyMap);
        // const closestKey = _.minBy(keys, k => {
        //     const parsed = parseInt(k);
        //     return parsed > time ? Infinity : time - parsed
        // });
        // return closestKey ? this.frequencyMap[closestKey as any] : 0;

        this.optimizedFrequencyMap = map;
    }

    read() {
        this.frequencyMap = {};
        const targettedSampleRateMs = 25;
        this.lastCrossingTime = 0;
        this.currentState = 'high';
        
        const dataLength = this.getDataLength();
        for (let i = 0; i < dataLength; i += WaveFileReader._TIME_INCREMENT_INTERVAL) {
            this.handleTimePoint(i);
        }

        this.computeOptimizedFrequencyMap();
        
    //     const freqs = Object.values(this.frequencyMap).reduce<any>((state, val) => {
    //         return {
    //             ...state,
    //             [val]: (state[val] ?? 0) + 1
    //         }
    //     }, {});
    //     console.log('freqs', freqs);
    //     const sseLocations = Object.entries(this.frequencyMap).filter(e => e[1] === 770);
    //    console.log('770s locs', sseLocations);

        // const programLength = this.readProgramLength();
        const bytes = this.readProgram();
        this.writeBinaryDump(bytes);
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