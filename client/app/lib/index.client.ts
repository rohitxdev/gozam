import { FFmpeg } from "@ffmpeg/ffmpeg";

export const convertToWav = async (file: File) => {
	const id = crypto.randomUUID();
	const inputFileName = `input-${id}`;
	const outputFileName = `output-${id}`;

	const uInt8Array = new Uint8Array(await file.arrayBuffer());
	// Creating new FFMPEG instance for every invocation instead of reusing it to speed up concurrent conversion as every instance creates a worker which runs in a new thread.
	const ffmpeg = new FFmpeg();
	await ffmpeg.load();
	await ffmpeg.writeFile(inputFileName, uInt8Array);

	/*
	 * ffmpeg command to convert audio to WAV format
	 * -i: input file
	 * -ac: number of audio channels (1 for mono)
	 * -ar: audio sample rate (22050 Hz)
	 * -acodec: audio codec (pcm_s16le for 16-bit PCM)
	 * -f: output format (wav)
	 * -y: overwrite output file if it exists
	 */
	const ffmpegArgs = ["-i", inputFileName, "-ac", "1", "-ar", "22050", "-acodec", "pcm_s16le", "-f", "wav", "-y", outputFileName];
	await ffmpeg.exec(ffmpegArgs);

	const wavData = await ffmpeg.readFile(outputFileName);
	await Promise.all([ffmpeg.deleteFile(inputFileName), ffmpeg.deleteFile(outputFileName)]);

	const wavFile = new File([wavData], file.name.replace(/\.[^/.]+$/, ".wav"), { type: "audio/wav" });
	return wavFile;
};
