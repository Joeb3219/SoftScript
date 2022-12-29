import { ApplesoftAssembler } from "../applesoft/ApplesoftAssembler";
import { DataUtil } from "../utils/Data.util";

type Sound = {
    frequency: number;
    cycles: number;
    invert?: boolean;
};

// Generates WAVE files that are capable of transmitted programs in Apple II's Cassette format.
// A good overview of the WAVE file format can be found here: http://soundfile.sapp.org/doc/WaveFormat/
// In essense, it consists of two parts:
// (1) A header, describing the file, metadata, etc.
// (2) The actual data
// This generator uses PCM to describe the data, in which we generate sine waves of various frequencies.
export class WaveFileGenerator {
    // The sample rate is how many "samples" will be taken per second.
    // This should be at least twice the highest frequency wave emitted in the file.
    // At most, we'll have a 12Khz signal, so a 48k sample rate is both commona nd sufficient.
    private static readonly _SAMPLE_RATE: number = 48000;
    // The format of the WAVE file, with 1 being equal to PCM.
    // Other values indicate compression or other means.
    private static readonly _FORMAT_TYPE: number = 1;
    // The number of channels being emitted.
    // One is sufficient for our purposes.
    private static readonly _NUMBER_CHANNELS: number = 1;
    // The number of bits used to describe an individual sample.
    // 8 implies each sample is an 8-bit unsigned integer.
    private static readonly _BYTES_PER_SAMPLE: number = 1;
    private static readonly _BITS_PER_SAMPLE: number =
        WaveFileGenerator._BYTES_PER_SAMPLE * 8;
    // The amplitude of each wave when at its full crest.
    // The value of 93 was obtained by reading several archives, and likely doesn't matter much.
    private static readonly _WAVE_AMPLITUDE: number = 93;

    constructor(private readonly program: string[]) {}

    // Generates the header of the WAVE file, the first 44 bytes of the WAVE file.
    // The header describes metadata for the file, including sample rate, length, number of channels, and format.
    // The provided dataSizeBytes should be equal to the number of samples times the number of bytes per sample.
    private getHeader(dataSizeBytes: number): Buffer {
        // The size of the entire header in bytes, 0x00 - 0x2a.
        const headerSize = 44;
        // For reasons not entirely clear, the "file size" of the WAVE file is defined in the spec as
        // the entire length in bytes, including headers, minus 8 bytes for the "RIFF" and filesize fields themselves.
        const fileSize = dataSizeBytes + headerSize - 8;

        // The names and positions of the various bytes here are described: http://soundfile.sapp.org/doc/WaveFormat/
        return Buffer.from([
            // Chunk ID
            ...DataUtil.createBufferedString(4, "RIFF"), // 0x0 - 0x3
            // Chunk Size
            ...DataUtil.createdBufferedUnsignedNumber(4, fileSize), // 0x4 - 0x7
            // Format
            ...DataUtil.createBufferedString(4, "WAVE"), // 0x8 - 0xb

            // ======
            // Subchunk 1: the FORMAT section
            // Contains 16 bytes describing the sample rate, encoding format, byte rate, etc
            // ======

            // Subchunk 1 ID
            ...DataUtil.createBufferedString(4, "fmt "), // 0xc - 0xf
            // Subchunk 1 Size
            ...DataUtil.createdBufferedUnsignedNumber(4, 16), // 0x10 - 0x13
            // Audio Format
            ...DataUtil.createdBufferedUnsignedNumber(
                2,
                WaveFileGenerator._FORMAT_TYPE
            ), // 0x14 - 0x15
            // Num Channels
            ...DataUtil.createdBufferedUnsignedNumber(
                2,
                WaveFileGenerator._NUMBER_CHANNELS
            ), // 0x16 - 17
            // Sample Rate
            ...DataUtil.createdBufferedUnsignedNumber(
                4,
                WaveFileGenerator._SAMPLE_RATE
            ), // 0x18 - 0x1a
            // Byte Rate
            ...DataUtil.createdBufferedUnsignedNumber(
                4,
                WaveFileGenerator._SAMPLE_RATE *
                    WaveFileGenerator._BITS_PER_SAMPLE *
                    WaveFileGenerator._BYTES_PER_SAMPLE
            ), // 0x1b - 0x1f
            // Block Align
            ...DataUtil.createdBufferedUnsignedNumber(
                2,
                WaveFileGenerator._NUMBER_CHANNELS *
                    WaveFileGenerator._BYTES_PER_SAMPLE
            ), // 0x20 - 0x21
            // Bits Per Sample
            ...DataUtil.createdBufferedUnsignedNumber(
                2,
                WaveFileGenerator._BITS_PER_SAMPLE
            ), // 0x22 - 0x23

            // ======
            // Subchunk 2: the DATA section
            // The data is appended directly after this header, which constitutes the contents of this header.
            // ======

            // Subchunk 2 ID
            ...DataUtil.createBufferedString(4, "data"), // 0x24 - 0x27
            // Subchunk 2 Size
            ...DataUtil.createdBufferedUnsignedNumber(4, dataSizeBytes), // 0x28 - 0x2a
        ]);
    }

    // Given a sound description, generates a buffer containing the sine wave representing that sound.
    generateSound(sound: Sound): Buffer {
        const numSamples = Math.ceil(
            WaveFileGenerator._SAMPLE_RATE / (sound.frequency / sound.cycles)
        );

        const buffer = Buffer.alloc(
            numSamples *
                WaveFileGenerator._NUMBER_CHANNELS *
                WaveFileGenerator._BYTES_PER_SAMPLE
        );

        // If inverted is set to true, we shift one phase over so that we start going from negative to positive.
        const offset = sound.invert
            ? Math.ceil(
                  WaveFileGenerator._SAMPLE_RATE / (sound.frequency / 0.5)
              )
            : 0;

        for (let sample = 0; sample < numSamples; sample++) {
            const step = (sample + offset) / WaveFileGenerator._SAMPLE_RATE;

            // Sine will be a value between -1 and 1, representing the position of the sine wave
            // at the given time step.
            const sine = Math.sin(sound.frequency * (2 * Math.PI) * step);

            // Given the computed sine value, modifies it so that it respects the requested amplitude.
            // After multiplying by the amplitude, our value will be between -_WAVE_AMPLITUDE and +_WAVE_AMPLITUDE.
            // We store our values as an unsigned 8-bit value, though, so we shift by 128.
            // This transforms our potential space from [-128, 128] to [0, 256] if _WAVE_AMPLITUDE is 128,
            // or [35, 221] if our _WAVE_AMPLITUDE is 93.
            const value = sine * WaveFileGenerator._WAVE_AMPLITUDE + 128;

            buffer.writeUInt8(
                value,
                sample * WaveFileGenerator._BYTES_PER_SAMPLE
            );
        }

        return buffer;
    }

    // Given a series of bytes representing either an assembled BASIC program or DATA block,
    // returns a buffer containing the bytes followed by a checksum byte.
    // The length of the returned buffer is thus one larger than the length of the bytes given as a parameter.
    createBufferedProgramRecordBody(programBytes: number[]): Buffer {
        if (programBytes.length === 0) {
            return Buffer.alloc(0);
        }

        // We request an extra byte at the end of the buffer for our checksum.
        const buffer = Buffer.alloc(programBytes.length + 1);

        // Copy in our n bytes.
        for (let i = 0; i < programBytes.length; i++) {
            buffer.writeUInt8(programBytes[i], i);
        }

        // Compute the checksum of the first n bytes, excluding our extra byte added for the checksum itself.
        const checksum = DataUtil.computeChecksum(
            [...buffer].slice(0, programBytes.length)
        );

        // Write the checksum.
        buffer.writeUint8(checksum, buffer.length - 1);

        return buffer;
    }

    // Computes a buffer containing the length of the BASIC program.
    // This buffer also contains a byte indicating whether the program should auto-run.
    // The programLength should be the number of bytes of the assembled (encoded) BASIC instructions.
    writeLengthRecordBody(
        programLength: number,
        shouldAutoRun: boolean = true
    ): Buffer {
        // We request 4 bytes for:
        // (1) 2 bytes of length
        // (2) 1 byte of auto-run flag on/off
        // (3) 1 byte of the checksum
        const buffer = Buffer.alloc(4);

        // Write the program length
        buffer.writeUInt16LE(programLength, 0);

        // 0xD5 is the BASIC Auto-Run flag.
        // When set to 0x00, the program will not automatically run after being loaded,
        // and the user will be able to list the instructions via `LIST`.
        buffer.writeUInt8(shouldAutoRun ? 0xd5 : 0x00, 2);

        // Compute the checksum just for the 3 bytes arleady written to the buffer.
        const checksum = DataUtil.computeChecksum([...buffer].slice(0, 3));

        // Write the checksum.
        buffer.writeUint8(checksum, 3);

        return buffer;
    }

    // Given a buffer of bytes, creates the sequence of sounds required to represent the bytes.
    generateSoundsFromBuffer(
        buffer: Buffer,
        highFreq: boolean = false
    ): Sound[] {
        // Given a series of bytes, we create a massive array of all of the bits.
        // Each byte's bits will be most significant bit (MSB) first.
        const bytes = [...buffer];
        const bits = bytes.flatMap((byte) => DataUtil.byteToBits(byte));

        // 1s are encoded as either 6Khz or 1Khz, 0s as 12Khz or 2Khz, if high frequency is enabled, respectively.
        // Each bit requires one full cycle.
        return bits.map((bit) => ({
            frequency:
                bit === 1 ? (highFreq ? 6000 : 1000) : highFreq ? 12000 : 2000,
            cycles: 1,
        }));
    }

    generate(shouldAutoRun: boolean = true): Buffer {
        // TODO: support data bytes input
        const dataBytes: number[] = [];

        // Convert the program into its assembled, encoded version
        const assembler = new ApplesoftAssembler(this.program);
        const programBytes = assembler.assemble();

        // Generate the buffers for the first header and second header, as described above.
        const lengthHeaderBuffer = this.writeLengthRecordBody(
            programBytes.length,
            shouldAutoRun
        );
        const programBasicBuffer =
            this.createBufferedProgramRecordBody(programBytes);
        const programDataBuffer =
            this.createBufferedProgramRecordBody(dataBytes);

        // The Cassette format uses a header format:
        //  (1) Approx 4 seconds of a "leader tone" at 770Hz
        //  (2) A sync bit, which is 1 half cycle of a 2500Hz tone, followed by 1 half cycle of a 2000Hz tone.
        //  (3) The data of the header
        //  (4) A checksum byte
        // Our archive will contain two headers:
        //  (1) A header describing the program's length + if auto run should be used.
        //  (2) A header describing the actual contents of the program.
        const sounds: Sound[] = [
            // ======
            // Header #1: the program length
            // ======

            // Leader tone
            {
                frequency: 770,
                cycles: 3080,
            },
            // First cycle of the sync bit
            {
                frequency: 2500,
                cycles: 0.5,
            },
            // Second cycle of the sync bit.
            // It is inverted because the Apple II uses a zero-crossing counter, so we need to "finish"
            // the preceding wave's half cycle.
            {
                frequency: 2000,
                cycles: 0.5,
                invert: true,
            },
            // Add sounds indicating the length of the program + auto run status
            ...this.generateSoundsFromBuffer(lengthHeaderBuffer),

            // ======
            // Header #2: the actual program data
            // ======

            // Leader tone
            {
                frequency: 770,
                cycles: 3080,
            },
            // First cycle of the sync bit
            {
                frequency: 2500,
                cycles: 0.5,
            },
            // Second cycle of the sync bit.
            // It is inverted because the Apple II uses a zero-crossing counter, so we need to "finish"
            // the preceding wave's half cycle.
            {
                frequency: 2000,
                cycles: 0.5,
                invert: true,
            },
            // Add sounds containing the actual program data
            ...this.generateSoundsFromBuffer(programBasicBuffer),
            // Add sounds containing the data blocks, if they exist
            // This uses high frequency mode
            ...this.generateSoundsFromBuffer(programDataBuffer, true),

            // ======
            // Closing sounds to end the transmission safely
            // ======

            // Add some 0 bits to close us out
            {
                frequency: 2000,
                cycles: 10,
            },
            // And a leader tone to really finish the job.
            {
                frequency: 770,
                cycles: 10,
            },
        ];

        // Join all of our sounds and our header
        const soundBuffer = Buffer.concat(
            sounds.map((sound) => this.generateSound(sound))
        );
        return Buffer.concat([this.getHeader(soundBuffer.length), soundBuffer]);
    }
}
