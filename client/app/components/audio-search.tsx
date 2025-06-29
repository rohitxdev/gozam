import { convertToWav } from "~/lib/index.client";
import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { API_ROUTES } from "~/constants";
import { LuMic, LuSquare, LuSearch } from "react-icons/lu";
import { z } from "zod";

const observeVolume = (stream: MediaStream, onVolumeChange?: (volume: number) => void) => {
	const ctx = new AudioContext();
	const src = ctx.createMediaStreamSource(stream);
	const analyser = ctx.createAnalyser();
	const dataArr = new Uint8Array(analyser.fftSize);

	src.connect(analyser);

	let animationFrameId: number;

	const getVolume = () => {
		analyser.getByteTimeDomainData(dataArr);

		let sum = 0;
		for (let i = 0; i < dataArr.length; i++) {
			const value = dataArr[i] - 128;
			sum += value * value;
		}
		const rms = Math.sqrt(sum / dataArr.length);
		// RMS max possible value is 128 (when all samples are 0 or 255)
		const normalizedRms = Math.min(rms / 128, 1);
		onVolumeChange?.(normalizedRms);

		animationFrameId = requestAnimationFrame(getVolume);
	};

	getVolume();

	return () => {
		cancelAnimationFrame(animationFrameId);
		src.disconnect();
		analyser.disconnect();
		ctx.close();
	};
};

const searchAudioResponseSchema = z.object({
	matches: z.array(z.string()),
});

export const AudioSearch = () => {
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const [isRecording, setIsRecording] = useState(false);
	const [wavFile, setWaveFile] = useState<File | null>(null);
	const [matches, setMatches] = useState<string[]>([]);
	const [micVolume, setMicVolume] = useState(0);

	const searchAudio = useMutation({
		mutationKey: ["searchAudio"],
		mutationFn: async (file: File) => {
			const formData = new FormData();
			formData.append("audio", file, file.name);
			const res = await fetch(API_ROUTES.audio.search, {
				method: "POST",
				body: formData,
			});
			if (!res.ok) {
				throw new Error("Failed to find audio matches");
			}
			const data = await res.json();
			return searchAudioResponseSchema.parse(data);
		},
		onSuccess: (data) => {
			setMatches(data.matches);
		},
	});

	const handleRecord = async () => {
		if (isRecording) {
			mediaRecorderRef.current?.stop();
			setIsRecording(false);
		} else {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			const recorder = new MediaRecorder(stream);
			const audioChunks: Blob[] = [];
			recorder.ondataavailable = (e) => {
				audioChunks.push(e.data);
			};
			recorder.onstop = async () => {
				const file = new File(audioChunks, crypto.randomUUID());
				const wavFile = await convertToWav(file);
				setWaveFile(wavFile);
			};
			recorder.start();
			mediaRecorderRef.current = recorder;
			setIsRecording(true);
		}
	};

	useEffect(() => {
		if (!isRecording) return;

		let cleanUpFn: VoidFunction;
		navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
			cleanUpFn = observeVolume(stream, setMicVolume);
		});

		return () => {
			cleanUpFn();
		};
	}, [isRecording]);

	return (
		<div className="grid place-content-center place-items-center gap-4 rounded-lg p-4">
			<h2>Search Audio</h2>
			<button
				className="flex w-fit items-center gap-2 rounded-full bg-red-500 p-4 text-white ring ring-red-500/40 [&_svg]:size-5"
				style={{ "--tw-ring-offset-width": `${isRecording ? micVolume * 100 : 0}px` } as React.CSSProperties}
				onClick={handleRecord}
			>
				{isRecording ? <LuSquare /> : <LuMic />}
			</button>
			{!isRecording && wavFile && (
				<div className="mt-8 grid justify-items-center gap-4">
					<audio src={URL.createObjectURL(wavFile)} controls />
					<button
						className="flex w-fit items-center gap-2 rounded-md bg-red-500 px-4 py-2 text-white"
						onClick={() => {
							searchAudio.mutate(wavFile);
						}}
					>
						{searchAudio.isPending ? (
							"Searching..."
						) : (
							<>
								<LuSearch /> Find Matches
							</>
						)}
					</button>
				</div>
			)}
			{matches.length > 0 && (
				<div className="mt-4 space-y-2">
					<h3 className="text-xl">Matches</h3>
					<ul className="space-y-2">
						{matches.map((match, i) => (
							<li
								data-hidden={i > 1 || undefined}
								className="flex items-center gap-4 rounded-md border bg-neutral-100 px-4 py-2 shadow data-hidden:line-through data-hidden:opacity-50 data-hidden:brightness-90"
								key={match}
							>
								{match}
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
};
