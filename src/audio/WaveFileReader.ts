import fs from "fs";
import _ from "lodash";
import { DataUtil } from "../utils/Data.util";

type SignalState = "high" | "low";

type ZeroCrossingCounterState = {
    signal: SignalState;
    lastCrossingTime: number;
    lastFrequency: number;
    frequencyMap: FrequencyMap;
    optimizedFrequencyMap: Record<number, number>;
    lastRecordedFrequency: number;
}

type FrequencyMap = Record<number, number>;

type BasicAndDataStore =
    | { data: number[] }
    | { data: number[]; basic: number[] };

export class WaveFileReader {
    private data: Buffer;
    private sampleRate: number;
    private numSamples: number;

    zeroCrossingCounterState: ZeroCrossingCounterState;

    constructor(path: string) {
        this.data = fs.readFileSync(path);

        this.sampleRate = this.data.readUint16LE(0x18);
        this.numSamples = this.data.readUInt32LE(0x28)
        console.debug("WAVE header parsed", { sampleRate: this.sampleRate, numSamples: this.numSamples });

        this.zeroCrossingCounterState = this.getInitialZeroCrossingCounterState();
    }

    private getInitialZeroCrossingCounterState(): ZeroCrossingCounterState {
        return {
            frequencyMap: {},
            optimizedFrequencyMap: {},
            lastCrossingTime: 0,
            lastFrequency: 0,
            lastRecordedFrequency: 0,
            signal: 'high'
        }
    }

    private getData(time: number) {
        if (time + 0x2c >= this.data.length) {
            return 0;
        }
        const data = this.data.readInt8(0x2c + time);
        if (data < 0) {
            return (128 + data) * -1;
        } else {
            return (data - 128) * -1;
        }
    }

    private roundToNearest(num: number, nearest: number) {
        return Math.round(num / nearest) * nearest;
    }

    private getClosestFrequency(freq: number): number {
        const knownFrequencyes: number[] = [
            770, 2000, 2250, 1500, 2500, 1000, 12000, 6000,
        ];

        const min = _.minBy(knownFrequencyes, (f) => Math.abs(f - freq)) ?? 0;
        const dist = freq - min;
        if (dist > 250) {
            return freq;
        }

        return min;
    }

    private handleTimePoint(time: number) {
        const value = this.getData(time);
        const valueState: SignalState = value >= 0 ? "high" : "low";
        if (this.zeroCrossingCounterState.signal !== valueState) {
            this.zeroCrossingCounterState.signal = valueState;

            // Calculate the "real" crossing time.
            // If this point has crossed the border, the last one has, by definition, not.
            // Given a sampling rate of x, the crossing could have happened any time in the last 1/x seconds.
            // Thus, we determine how close between the previous value and the current value was, which is more likely when we crossed.
            // This works fine for regular single waves, but probably breaks for more complicated noise construction.
            const totalDistance = value - this.zeroCrossingCounterState.lastFrequency;
            const distance = Math.abs(value / totalDistance);
            const fixedTime = time - distance;

            const timeSinceLastCrossing = fixedTime - this.zeroCrossingCounterState.lastCrossingTime;

            const secondsBetweenCrossings =
                (2 * timeSinceLastCrossing) / this.sampleRate;
            const baseFrequency = 1 / secondsBetweenCrossings;

            const frequency = this.roundToNearest(
                baseFrequency,
                10
            );

            const closest = this.getClosestFrequency(frequency);

            if (!isFinite(frequency)) {
                return;
            }

            if (closest !== this.zeroCrossingCounterState.lastRecordedFrequency) {
                const startOfWave =
                    Math.ceil(this.sampleRate / (closest / 0.5)) - 1;

                const timeCandidate = time - startOfWave;
                this.zeroCrossingCounterState.frequencyMap[timeCandidate > 0 ? timeCandidate : time] =
                    closest;
                this.zeroCrossingCounterState.lastRecordedFrequency = closest;
            }

            this.zeroCrossingCounterState.lastCrossingTime = fixedTime;
        }

        this.zeroCrossingCounterState.lastFrequency = value;
    }

    getInferredFrequencyAtTime(time: number): number {
        const key = this.zeroCrossingCounterState.optimizedFrequencyMap[time];
        return this.zeroCrossingCounterState.frequencyMap[key];
    }

    private dec2bin(dec: number) {
        return (dec >>> 0).toString(2).padStart(8, "0");
    }

    private validateChecksum(bytes: number[], checksum: number) {
        const computedChecksum = DataUtil.computeChecksum(bytes);

        console.debug(
            `Validating checksum`,
            this.dec2bin(checksum),
            this.dec2bin(computedChecksum)
        );

        if (checksum !== computedChecksum) {
            throw new Error(
                `Computed checksum ${computedChecksum} does not match expected checksum ${checksum}`
            );
        }
    }

    private convertBitsToBytes(bits: number[]): number[] {
        return _.chunk(bits.slice(0, Math.floor(bits.length / 8) * 8), 8).map(
            (groupBits) => {
                let byte = 0;
                for (const bit of groupBits) {
                    byte = (byte << 1) | bit;
                }

                return byte;
            }
        );
    }

    private getBytesFromBits(
        bits: number[],
        byteLength?: number
    ): BasicAndDataStore {
        if (byteLength) {
            const bitsNeededForBasicAndChecksum = (byteLength + 2) * 8;
            const bytes = this.convertBitsToBytes(
                bits.slice(0, bitsNeededForBasicAndChecksum)
            );

            const basicRealBytes = _.slice(bytes, 0, bytes.length - 1);
            const basicChecksum = _.last(bytes) ?? 0;

            this.validateChecksum(basicRealBytes, basicChecksum);

            const dataBytes = this.convertBitsToBytes(
                bits.slice(bitsNeededForBasicAndChecksum + 5, bits.length)
            );
            if (dataBytes.length === 0) {
                return { basic: basicRealBytes, data: [] };
            }
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
    private readBytes(
        startingPosition: number,
        byteLength?: number
    ): BasicAndDataStore {
        let i = startingPosition;
        const bits: number[] = [];

        console.debug("Reading bytes starting at sample", startingPosition);
        while (i < this.numSamples) {
            const inferredFrequency = this.getInferredFrequencyAtTime(i);

            if (
                inferredFrequency === 770 ||
                inferredFrequency === -1 ||
                inferredFrequency === 2500
            ) {
                console.debug("Found header frequency at sample", i);
                break;
            }

            if (
                inferredFrequency !== 2000 &&
                inferredFrequency !== 1000 &&
                inferredFrequency !== 12000 &&
                inferredFrequency !== 6000
            ) {
                throw new Error(
                    `Found unexpected frequency when parsing bit: ${inferredFrequency} at sample ${i}`
                );
            }

            const isOne =
                inferredFrequency === 1000 || inferredFrequency === 6000;
            bits.push(isOne ? 1 : 0);
            const timeAdvancement = Math.ceil(
                this.sampleRate *
                    (inferredFrequency === 2000
                        ? 0.0005
                        : inferredFrequency === 1000
                        ? 0.001
                        : inferredFrequency === 12000
                        ? 0.001 / 12
                        : 0.001 / 6)
            );
            i += timeAdvancement;
        }

        const realBytes = this.getBytesFromBits(bits, byteLength);

        return realBytes;
    }

    private getLengthStart(which: number = 0) {
        const headerKeys = Object.entries(this.zeroCrossingCounterState.frequencyMap)
            .filter((entry) => {
                if (entry[1] === 770) return true;
            })
            .map((entry) => parseInt(entry[0]));

        const afterKey = headerKeys[which];
        const startRange = Object.entries(this.zeroCrossingCounterState.frequencyMap).find((entry) => {
            if (entry[1] === 2500 && parseInt(entry[0]) >= afterKey)
                return true;
        })?.[0];
        const startKey = parseInt(startRange ?? "0");

        return startKey + 24;
    }

    private readProgram() {
        const programLength = this.readProgramLength();
        console.debug("Program is of length", programLength);
        const bytes = this.readBytes(this.getLengthStart(1), programLength);

        return bytes;
    }

    private readProgramLength() {
        const bytes = this.readBytes(this.getLengthStart(0)).data;
        const length = (bytes[1] << 8) | bytes[0];

        return length;
    }

    private computeOptimizedFrequencyMap() {
        const keys = Object.keys(this.zeroCrossingCounterState.frequencyMap);
        const sortedKeys = _.sortBy(keys);
        const map: Record<number, number> = {};

        let currentKeyIndex = 0;
        const range = _.range(0, this.numSamples);
        for (const i of range) {
            while (true) {
                const currentCandidateKey = parseInt(
                    sortedKeys[currentKeyIndex]
                );
                const nextCandidateKey = parseInt(
                    sortedKeys[currentKeyIndex + 1]
                );

                if (nextCandidateKey < i) {
                    currentKeyIndex++;
                } else {
                    map[i] = currentCandidateKey;
                    break;
                }
            }
        }

        this.zeroCrossingCounterState.optimizedFrequencyMap = map;
    }

    read() {
        this.zeroCrossingCounterState = this.getInitialZeroCrossingCounterState();

        for (
            let sample = 0;
            sample < this.numSamples;
            sample ++
        ) {
            this.handleTimePoint(sample);
        }

        this.computeOptimizedFrequencyMap();

        return this.readProgram();
    }
}
