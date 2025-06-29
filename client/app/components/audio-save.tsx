import { useMutation } from "@tanstack/react-query";
import { LuFileMusic, LuSave, LuUpload } from "react-icons/lu";
import { API_ROUTES } from "~/constants";
import { convertToWav } from "~/lib/index.client";
import { useState } from "react";
import { queryClient } from "~/lib/react-query";

export const AudioSave = () => {
	const [wavFiles, setWaveFiles] = useState<File[]>([]);

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

	return (
		<div className="grid place-content-center justify-items-center gap-4 rounded-lg p-4">
			<div>
				<h2>Save Audio</h2>
				<p className="mt-2 text-neutral-500">Save audio to database so it can be searched</p>
			</div>
			<label className="flex items-center justify-center gap-2 rounded-md bg-neutral-200 px-4 py-2">
				<LuUpload />
				Upload media
				<input
					type="file"
					accept="video/*,audio/*"
					multiple
					onInput={async (e) => {
						const wavFiles = await Promise.all(Array.from(e.currentTarget.files ?? []).map(convertToWav));
						// e.currentTarget.value = "";
						console.log("Converted WAV files:", wavFiles);

						setWaveFiles(wavFiles);
					}}
					className="hidden"
				/>
			</label>
			{wavFiles.length > 0 && (
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
						onClick={() => saveAudio.mutate(wavFiles)}
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
			)}
		</div>
	);
};
