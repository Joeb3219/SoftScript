import fs from "fs";
import _ from "lodash";
import { ApplesoftDisassembler } from "../applesoft/ApplesoftDisassembler";

type SignalState = "high" | "low";

type FrequencyMap = Record<number, number>;

type BasicAndDataStore =
    | { data: number[] }
    | { data: number[]; basic: number[] };

export class WaveFileReader {
    private data: Buffer;

    private currentState: SignalState = "high";
    private lastCrossingTime = 0;
    private optimizedFrequencyMap: Record<number, number> = {};
    private sampleRate = 48_000;
    private lastSignal = 0;
    private frequencyMap: FrequencyMap = {};
    private lastRecordedFrequency: number = 0;
    private static _TIME_INCREMENT_INTERVAL = 1;

    constructor(path: string) {
        this.data = fs.readFileSync(path);

        this.sampleRate = this.data.readUint16LE(0x18);
        console.log("sample rate", this.sampleRate);
    }

    private getDataLength() {
        return this.data.readUInt32LE(40);
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

            const secondsBetweenCrossings =
                (2 * timeSinceLastCrossing) / this.sampleRate;
            const baseFrequency = 1 / secondsBetweenCrossings;

            const frequency = this.roundToNearest(
                baseFrequency, //this.lastFrequency && isFinite(this.lastFrequency) ? (this.lastFrequency + baseFrequency) / 2 : baseFrequency
                10
            );

            const closest = this.getClosestFrequency(frequency);

            if (!isFinite(frequency)) {
                return;
            }

            if (closest !== this.lastRecordedFrequency) {
                const startOfWave =
                    Math.ceil(this.sampleRate / (closest / 0.5)) - 1;

                const timeCandidate = time - startOfWave;
                this.frequencyMap[timeCandidate > 0 ? timeCandidate : time] =
                    closest;
                this.lastRecordedFrequency = closest;
            }

            this.lastCrossingTime = fixedTime;
        }

        this.lastSignal = value;
    }

    getInferredFrequencyAtTime(time: number): number {
        const key = this.optimizedFrequencyMap[time];
        return this.frequencyMap[key];
    }

    private dec2bin(dec: number) {
        return (dec >>> 0).toString(2).padStart(8, "0");
    }

    private validateChecksum(bytes: number[], checksum: number) {
        const computedChecksum = bytes.reduce((state, byte) => {
            return state ^ byte;
            // Unlike most checksums, Apple uses 0xFF instead of 0x00.
            // See: http://mirrors.apple2.org.za/ground.icaen.uiowa.edu/MiscInfo/Programming/cassette.format
        }, 0xff);

        console.log(
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

        console.log("starting position", startingPosition);
        while (i < this.getDataLength()) {
            const inferredFrequency = this.getInferredFrequencyAtTime(i);

            if (
                inferredFrequency === 770 ||
                inferredFrequency === -1 ||
                inferredFrequency === 2500
            ) {
                console.log("found header frequency", i);
                break;
            }

            if (
                inferredFrequency !== 2000 &&
                inferredFrequency !== 1000 &&
                inferredFrequency !== 12000 &&
                inferredFrequency !== 6000
            ) {
                throw new Error(
                    `Found unexpected frequency when parsing bit: ${inferredFrequency}`
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
        const headerKeys = Object.entries(this.frequencyMap)
            .filter((entry) => {
                if (entry[1] === 770) return true;
            })
            .map((entry) => parseInt(entry[0]));

        const afterKey = headerKeys[which];
        const startRange = Object.entries(this.frequencyMap).find((entry) => {
            if (entry[1] === 2500 && parseInt(entry[0]) >= afterKey)
                return true;
        })?.[0];
        const startKey = parseInt(startRange ?? "0");

        return startKey + 24;
    }

    private readProgram() {
        const programLength = this.readProgramLength();
        console.log("PROGRAM IS OF LENGTH " + programLength);
        const bytes = this.readBytes(this.getLengthStart(1), programLength);

        return bytes;
    }

    private readProgramLength() {
        const bytes = this.readBytes(this.getLengthStart(0)).data;
        const length = (bytes[1] << 8) | bytes[0];

        return length;
    }

    private writeBinaryDump(bytes: BasicAndDataStore) {
        if ("basic" in bytes) {
            const basicbuff = Buffer.alloc(bytes.basic.length);
            bytes.basic.forEach((b, idx) => basicbuff.writeUInt8(b, idx));
            fs.writeFileSync("/Users/joeb3219/Downloads/basic.dump", basicbuff);
        }

        const databuff = Buffer.alloc(bytes.data.length);
        bytes.data.forEach((b, idx) => databuff.writeUInt8(b, idx));
        fs.writeFileSync("/Users/joeb3219/Downloads/data.dump", databuff);
    }

    private computeOptimizedFrequencyMap() {
        const keys = Object.keys(this.frequencyMap);
        const sortedKeys = _.sortBy(keys);
        const map: Record<number, number> = {};

        let currentKeyIndex = 0;
        const range = _.range(0, this.getDataLength());
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

        this.optimizedFrequencyMap = map;
    }

    read() {
        this.frequencyMap = {};
        const targettedSampleRateMs = 25;
        this.lastCrossingTime = 0;
        this.currentState = "high";

        const dataLength = this.getDataLength();
        for (
            let i = 0;
            i < dataLength;
            i += WaveFileReader._TIME_INCREMENT_INTERVAL
        ) {
            this.handleTimePoint(i);
        }

        this.computeOptimizedFrequencyMap();

        const bytes = this.readProgram();
        this.writeBinaryDump(bytes);

        const foo =
            "basic" in bytes
                ? new ApplesoftDisassembler(bytes.basic)
                : undefined;
        const disassm = foo?.disassemble();
        console.log(disassm);
    }
}
