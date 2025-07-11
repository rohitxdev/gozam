import { useMutation } from "@tanstack/react-query";
import { LuDownload, LuFileMusic, LuFilePlus2, LuSave } from "react-icons/lu";
import { API_ROUTES } from "~/constants";
import { convertToWav } from "~/lib/index.client";
import { useState } from "react";
import { queryClient } from "~/lib/react-query";
import { flushSync } from "react-dom";

const getFileNameFromHeaders = (headers: Headers) => {
	const disposition = headers.get("Content-Disposition");
	if (!disposition) return null;
	if (!disposition.includes("filename=")) return null;

	const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)?.[1];
	if (!match) return null;

	return match.replace(/['"]/g, "");
};

export const AudioSave = () => {
	const [wavFiles, setWaveFiles] = useState<File[]>([]);
	const [videoUrl, setVideoUrl] = useState("");
	const [downloadedAudioFile, setDownloadedAudioFile] = useState<File | null>(null);

	const saveAudio = useMutation({
		mutationKey: ["saveAudio"],
		mutationFn: async (files: File[]) => {
			await Promise.all(
				files.map(async (file) => {
					const formData = new FormData();
					formData.append("audio", file, file.name);
					const res = await fetch(API_ROUTES.audio.save, {
						method: "POST",
						body: formData,
					});
					if (!res.ok) {
						throw new Error("Failed to save audio");
					}
					return res.json();
				}),
			);
		},
		onSettled: () => {
			setWaveFiles([]);
			queryClient.invalidateQueries({ queryKey: ["listAudio"] });
		},
	});

	const downloadYoutubeVideo = useMutation({
		mutationKey: ["downloadYoutubeVideo"],
		mutationFn: async (url: string) => {
			const apiEndpoint = new URL(API_ROUTES.download.youtube);
			apiEndpoint.searchParams.set("url", url);
			const res = await fetch(apiEndpoint);
			if (!res.ok) throw Error("failed to download yt video");

			const fileName = getFileNameFromHeaders(res.headers);
			if (!fileName) throw new Error("failed to get file name");

			const blob = await res.blob();
			return {
				fileName,
				blob,
			};
		},
		onSuccess: ({ fileName, blob }) => {
			const file = new File([blob], fileName);
			setDownloadedAudioFile(file);
		},
	});

	return (
		<div className="grid place-content-center justify-items-center gap-4 rounded-lg p-4">
			<div className="mb-8">
				<h2>Save Audio</h2>
				<p className="mt-2 text-neutral-500">Save audio to database so it can be searched</p>
			</div>
			<label className="flex items-center justify-center gap-2 rounded-md bg-neutral-200 px-4 py-2">
				<LuFilePlus2 />
				Select file(s)
				<input
					type="file"
					accept="video/*,audio/*"
					multiple
					onChange={async (e) => {
						const convertedFiles = await Promise.all(Array.from(e.currentTarget.files ?? []).map(convertToWav));
						setWaveFiles(convertedFiles);
					}}
					className="hidden"
				/>
			</label>
			<p className="uppercase font-medium text-neutral-600 text-2xl">or</p>
			<div className="flex gap-4">
				<input
					className="ring p-2 rounded-md bg-neutral-100 min-w-0 w-md"
					type="url"
					placeholder="Enter youtube video link"
					value={videoUrl}
					onInput={(e) => setVideoUrl(e.currentTarget.value)}
				/>
				<button
					className="flex gap-2 mx-auto w-fit px-4 py-2 items-center justify-center rounded-md bg-neutral-200 disabled:opacity-75 disabled:cursor-not-allowed"
					disabled={downloadYoutubeVideo.isPending}
					onClick={() => downloadYoutubeVideo.mutate(videoUrl)}
				>
					{downloadYoutubeVideo.isPending ? (
						<>Downloading...</>
					) : (
						<>
							<LuDownload />
							Download
						</>
					)}
				</button>
			</div>
			{downloadedAudioFile && (
				<div className="grid gap-4 place-items-center">
					<video className="aspect-video shadow-lg ring ring-neutral-300 rounded" src={URL.createObjectURL(downloadedAudioFile)} controls />
					<p>{downloadedAudioFile.name}</p>
				</div>
			)}
			{wavFiles.length > 0 ||
				(downloadedAudioFile && (
					<div className="mt-8 grid items-center justify-items-center gap-4">
						<div className="grid w-xl justify-items-center gap-2">
							{wavFiles.map((file) => (
								<div key={file.name} className="flex items-center gap-2">
									<LuFileMusic className="text-neutral-500" /> <p>{file.name}</p>
								</div>
							))}
						</div>
						<button
							className="flex items-center justify-center gap-2 rounded-md bg-blue-500 px-4 py-2 text-white"
							onClick={async () => {
								saveAudio.mutate(downloadedAudioFile ? [await convertToWav(downloadedAudioFile)] : wavFiles);
								setDownloadedAudioFile(null);
							}}
						>
							{saveAudio.isPending ? (
								"Saving..."
							) : (
								<>
									<LuSave /> Save audio
								</>
							)}
						</button>
					</div>
				))}
		</div>
	);
};
