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
};

type FrequencyMap = Record<number, number>;

type BasicAndDataStore =
    | { data: number[] }
    | { data: number[]; basic: number[] };

// Reads a WAVE archive of an Apple II Cassette and parses the BASIC program and data blocks.
// This can decode any of the archives made from WaveFileGenerator, or those from the Apple II itself.
export class WaveFileReader {
    // The frequencies, in Hz, that various signals are meant to be written as.
    private static readonly _FREQUENCY_LEADER = 770;
    private static readonly _FREQUENCY_SYNC_BIT = 2500;
    private static readonly _FREQUENCY_ZERO_LOW_FREQUENCY = 2000;
    private static readonly _FREQUENCY_ZERO_HIGH_FREQUENCY = 12000;
    private static readonly _FREQUENCY_ONE_LOW_FREQUENCY = 1000;
    private static readonly _FREQUENCY_ONE_HIGH_FREQUENCY = 6000;

    // The number of Hz a frequency can differ from a "known" candidate.
    // Used to resolve small differences in observed frequencies due to sampling issues.
    private static readonly _MAXIMUM_FREQUENCY_DIVERGENCE = 250;

    // Data inferred from the file path about the wave file.
    private data: Buffer;
    private sampleRate: number;
    private numSamples: number;

    // The state that manages the Zero Crossing Counter.
    // Zero crossing counters count how many times a wave oscilates from positive to negative and vice versa.
    // If a wave goes from zero to zero in a given time span, we can compute the frequency of that wave.
    // This is how the Apple II computes the frequency, and is how we do too -- it's quick and cheap!
    zeroCrossingCounterState: ZeroCrossingCounterState;

    constructor(path: string) {
        this.data = fs.readFileSync(path);

        // For specifics on these fields and how they're stored,
        // see either WaveFileGenerator or http://soundfile.sapp.org/doc/WaveFormat/
        this.sampleRate = this.data.readUint16LE(0x18);
        this.numSamples = this.data.readUInt32LE(0x28);
        console.debug("WAVE header parsed", {
            sampleRate: this.sampleRate,
            numSamples: this.numSamples,
        });

        this.zeroCrossingCounterState = this.getInitialZeroCrossingCounterState;
    }

    // Returns an initial state for the Zero Crossing Counter.
    // Everything is initialized to either 0 or an empty map.
    private get getInitialZeroCrossingCounterState(): ZeroCrossingCounterState {
        return {
            frequencyMap: {},
            optimizedFrequencyMap: {},
            lastCrossingTime: 0,
            lastFrequency: 0,
            lastRecordedFrequency: 0,
            signal: "high",
        };
    }

    // Given a sample number, finds the raw amplitude of the wave at that given sample, from -128 to 128.
    private getRawValueAtSample(sample: number): number {
        if (sample + 0x2c >= this.data.length) {
            return 0;
        }
        const data = this.data.readInt8(0x2c + sample);

        // Fixes math issues arriving from UInt -> Int conversion.
        if (data < 0) {
            return (128 + data) * -1;
        } else {
            return (data - 128) * -1;
        }
    }

    // Given a frequency, finds the closest known frequency, within reason (i.e. within _MAXIMUM_FREQUENCY_DIVERGENCE).
    // This is used as a sort of smoothing to prevent two classes of errors:
    //  (1) Audio defects due to old hardware
    //  (2) Sampling issues for the higher frequency signals.
    // If no closest frequency can be found, we return the frequency as it was observed.
    private getClosestKnownFrequency(freq: number): number {
        const knownFrequencyes: number[] = [
            WaveFileReader._FREQUENCY_LEADER,
            WaveFileReader._FREQUENCY_ZERO_LOW_FREQUENCY,
            WaveFileReader._FREQUENCY_SYNC_BIT,
            WaveFileReader._FREQUENCY_ONE_LOW_FREQUENCY,
            WaveFileReader._FREQUENCY_ZERO_HIGH_FREQUENCY,
            WaveFileReader._FREQUENCY_ONE_HIGH_FREQUENCY,
        ];

        // Find the closest frequency by absolute value
        const min = _.minBy(knownFrequencyes, (f) => Math.abs(f - freq)) ?? 0;

        // Ensure it's not too far away.
        // If so, we'll just return what we were given.
        const dist = freq - min;
        if (dist > WaveFileReader._MAXIMUM_FREQUENCY_DIVERGENCE) {
            return freq;
        }

        return min;
    }

    // Given a sample number, handles processing it.
    // This should only be called during the read() function, as part of the state computation.
    // Undefined behavior can occur if ran multiple times.
    private handleSample(sample: number) {
        const value = this.getRawValueAtSample(sample);
        const valueState: SignalState = value >= 0 ? "high" : "low";

        // If the signal isn't the same as last time, we have crossed zero and thus have to update our tracker.
        if (this.zeroCrossingCounterState.signal !== valueState) {
            this.zeroCrossingCounterState.signal = valueState;

            // Calculate the "real" crossing sample.
            // If this point has crossed the border, the last one has, by definition, not.
            // Given a sampling rate of x, the crossing could have happened any sample in the last 1/x seconds.
            // Thus, we determine how close between the previous value and the current value was, which is more likely when we crossed.
            // This works fine for regular single waves, but probably breaks for more complicated noise construction.
            const totalDistance =
                value - this.zeroCrossingCounterState.lastFrequency;
            const distance = Math.abs(value / totalDistance);
            const fixedSample = sample - distance;

            const timeSinceLastCrossing =
                fixedSample - this.zeroCrossingCounterState.lastCrossingTime;

            // Given the time `t` since the last crossing, we can compute the frequency.
            // If there's been 24 samples since the last crossing, and the sample rate is 48k,
            // there must be 48 samples in a full cycle (we cross zero twice per full cycle),
            // which therefore means our frequency is 1 / (2 * 24 / 48000), or 1KHz.
            const secondsBetweenCrossings =
                (2 * timeSinceLastCrossing) / this.sampleRate;
            const baseFrequency = 1 / secondsBetweenCrossings;

            if (!isFinite(baseFrequency)) {
                return;
            }

            // Smooth our frequency to a close value to avoid audio processing causing noise.
            const closest = this.getClosestKnownFrequency(baseFrequency);

            // This isn't the same as the previous frequency, so we take note of it.
            if (
                closest !== this.zeroCrossingCounterState.lastRecordedFrequency
            ) {
                // Compute when the wave started, by walking from the previous wave
                const startOfWave =
                    Math.ceil(this.sampleRate / (closest / 0.5)) - 1;

                // Store in our frequency map.
                const sampleCandidate = sample - startOfWave;
                this.zeroCrossingCounterState.frequencyMap[
                    sampleCandidate > 0 ? sampleCandidate : sample
                ] = closest;
                this.zeroCrossingCounterState.lastRecordedFrequency = closest;
            }

            this.zeroCrossingCounterState.lastCrossingTime = fixedSample;
        }

        // Keep track of this frequency so we can determine progress from it to the current sample.
        this.zeroCrossingCounterState.lastFrequency = value;
    }

    // Assuming the optimized frequency map has already been computed,
    // this function returns the cleaned frequency we resolved at a given sample.
    private getInferredFrequencyAtSample(sample: number): number {
        const key = this.zeroCrossingCounterState.optimizedFrequencyMap[sample];
        return this.zeroCrossingCounterState.frequencyMap[key];
    }

    // Given a series of bits, converts them to bytes and then extracts the data and, if applicable, BASIC program.
    // If byteLength is provided, only the first byteLength bytes are considered for BASIC, the rest for data.
    // If no byteLength is provded, we assume we are just processing data.
    // Both scenarios will cause a checksum validation to throw an error if the checksum does not pass.
    private extractAndValidateDataFromBits(
        bits: number[],
        byteLength?: number
    ): BasicAndDataStore {
        // There is a BASIC program and potentially extra data
        if (byteLength) {
            const bitsNeededForBasicAndChecksum = (byteLength + 2) * 8;

            const basicBytes = DataUtil.bitsToBytesAndValidateChecksum(
                bits.slice(0, bitsNeededForBasicAndChecksum)
            );

            // TODO: better document and test this portion of code.
            // The offset of 5 bits was obtained from empircal testing of real archives.
            const dataBits = bits.slice(
                bitsNeededForBasicAndChecksum + 5,
                bits.length
            );

            // There are no data bits, so we'll just return the basic.
            if (dataBits.length / 8 < 1) {
                return { basic: basicBytes, data: [] };
            }

            const dataBytes = DataUtil.bitsToBytesAndValidateChecksum(dataBits);

            return { data: dataBytes, basic: basicBytes };
        }

        // No byteLength implies we are just processing raw data.
        return { data: DataUtil.bitsToBytesAndValidateChecksum(bits) };
    }

    // Reads the bytes starting at position until we end the stream
    // Throws an error if the checksum byte fails.
    private readBytes(
        startingPosition: number,
        byteLength?: number
    ): BasicAndDataStore {
        let sample = startingPosition;
        const bits: number[] = [];

        console.debug("Reading bytes starting at sample", startingPosition);

        // Starting at the beginning sample, we iterate through each wave cycle.
        // Once we identify the current cycle, we add the bit to our list, and then move forward sufficiently to be
        // at the next wave cycle.
        // This continues until we reach either the end of the file, or the next header.
        while (sample < this.numSamples) {
            const inferredFrequency = this.getInferredFrequencyAtSample(sample);

            // Header or sync bit encountered -- we are finished.
            if (
                inferredFrequency === WaveFileReader._FREQUENCY_LEADER ||
                inferredFrequency === -1 ||
                inferredFrequency === WaveFileReader._FREQUENCY_SYNC_BIT
            ) {
                console.debug("Found header frequency at sample", sample);
                break;
            }

            // Unexpected wave encountered.
            if (
                inferredFrequency !==
                    WaveFileReader._FREQUENCY_ZERO_LOW_FREQUENCY &&
                inferredFrequency !==
                    WaveFileReader._FREQUENCY_ONE_LOW_FREQUENCY &&
                inferredFrequency !==
                    WaveFileReader._FREQUENCY_ZERO_HIGH_FREQUENCY &&
                inferredFrequency !==
                    WaveFileReader._FREQUENCY_ONE_HIGH_FREQUENCY
            ) {
                throw new Error(
                    `Found unexpected frequency when parsing bit: ${inferredFrequency} at sample ${sample}`
                );
            }

            // Add the bit, either 12KHz/2KHz for a 0, or 6KHz/1KHz for a 1.
            const isOne =
                inferredFrequency ===
                    WaveFileReader._FREQUENCY_ONE_LOW_FREQUENCY ||
                inferredFrequency ===
                    WaveFileReader._FREQUENCY_ONE_HIGH_FREQUENCY;
            bits.push(isOne ? 1 : 0);

            // After processing the wave, we now move forward exactly one wave cycle.
            // e.g. if the frequency is 2000Hz and sample rate is 48k, we move forward 24 samples.
            // This means our next iteration will be at the beginning of the next wave.
            const timeAdvancement = Math.ceil(
                this.sampleRate / inferredFrequency
            );
            sample += timeAdvancement;
        }

        // Convert the bits to bytes and send er back.
        return this.extractAndValidateDataFromBits(bits, byteLength);
    }

    // Returns the sample number that a given header starts at.
    // Every header begins with a 770Hz leader, followed by a sync bit, and then the data and checksum.
    // This function returns the very first sample to begin reading the data at.
    private getSampleHeaderDataStartsAt(which: number = 1 | 2) {
        // Since the 770Hz leader is played before each header, to find the nth header,
        // we must find the nth leader
        const headerKeys = Object.entries(
            this.zeroCrossingCounterState.frequencyMap
        )
            .filter((entry) => {
                if (entry[1] === WaveFileReader._FREQUENCY_LEADER) return true;
            })
            .map((entry) => parseInt(entry[0]));

        const afterKey = headerKeys[which];

        // Now we find the first 2500Hz signal (the first half of the sync bit) such that it begins _after_ the nth 770Hz leader.
        const startRange = Object.entries(
            this.zeroCrossingCounterState.frequencyMap
        ).find((entry) => {
            if (
                entry[1] === WaveFileReader._FREQUENCY_SYNC_BIT &&
                parseInt(entry[0]) >= afterKey
            )
                return true;
        })?.[0];

        if (!startRange) {
            throw new Error(`Failed to find header #${which} in file`);
        }

        // Parse the key since Typescript can't reconcile that we are using numeric indices.
        const startKey = parseInt(startRange ?? "0");

        // If `startKey` is the first sample at which the sync bit starts,
        // we will need to move half of a 2500Hz cycle (1250Hz) and half of a 2000Hz cycle (1000Hz) samples
        // forward to where the first bit is.
        // We add 2 samples to the offset to ensure we're a sample or two into the wave.
        const offset = Math.ceil(this.sampleRate / 2250) + 2;
        return startKey + offset;
    }

    // Returns the length of the BASIC program from the length header.
    private readProgramLength() {
        const bytes = this.readBytes(this.getSampleHeaderDataStartsAt(0)).data;
        return DataUtil.readInt16(bytes, 0);
    }

    // Reads the program in its entirety, returning the data bytes and, if applicable, the BASIC bytes.
    private readProgram() {
        const programLength = this.readProgramLength();
        console.debug("Program is of length", programLength);

        return this.readBytes(
            this.getSampleHeaderDataStartsAt(1),
            programLength
        );
    }

    // An optimization that also makes the frequency map a bit easier to reason about.
    // For each sample, computes the key to read from.
    // This computation is O(n) where n is the total number of samples to create,
    // and subsequent lookups are O(1), ergo O(n) overall.
    // Without this optimized map, lookup for each of the n samples is O(n), ergo O(n^2) overall
    private computeOptimizedFrequencyMap() {
        const keys = Object.keys(this.zeroCrossingCounterState.frequencyMap);
        const sortedKeys = _.sortBy(keys);
        const map: Record<number, number> = {};

        let currentKeyIndex = 0;
        const range = _.range(0, this.numSamples);
        // On each iteration, we find the largest key such that it is still smaller than the sample index.
        // Since the keys are sorted and we are iterating through the samples in ascending order,
        // we will never have to re-access previous entries from sortedKeys once we've moved past them.
        for (const i of range) {
            while (true) {
                const currentCandidateKey = parseInt(
                    sortedKeys[currentKeyIndex]
                );
                const nextCandidateKey = parseInt(
                    sortedKeys[currentKeyIndex + 1]
                );

                // The next key is closer to the current key than this one is
                if (nextCandidateKey < i) {
                    currentKeyIndex++;
                } else {
                    // The next key is bigger than this one, so we will continue using the old key.
                    map[i] = currentCandidateKey;
                    break;
                }
            }
        }

        this.zeroCrossingCounterState.optimizedFrequencyMap = map;
    }

    // Reads the data from the WAVE archive and return the BASIC/Data bytes.
    // May throw errors if anything fails.
    read(): BasicAndDataStore {
        this.zeroCrossingCounterState = this.getInitialZeroCrossingCounterState;

        for (let sample = 0; sample < this.numSamples; sample++) {
            this.handleSample(sample);
        }

        this.computeOptimizedFrequencyMap();

        return this.readProgram();
    }
}
