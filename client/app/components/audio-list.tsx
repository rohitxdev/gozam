import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { API_ROUTES } from "~/constants";

const listAudioResponseSchema = z.object({
	fileNames: z.array(z.string()),
});

export const AudioList = () => {
	const listAudio = useQuery({
		queryKey: ["listAudio"],
		queryFn: async () => {
			const res = await fetch(API_ROUTES.audio.list);
			if (!res.ok) {
				throw new Error("Failed to fetch audio files");
			}
			const data = await res.json();
			return listAudioResponseSchema.parse(data);
		},
	});

	return (
		<div className="grid max-h-[calc(100vh-2rem)] content-start gap-4 rounded-lg p-4">
			<h2>Searchable Titles</h2>
			{listAudio.data?.fileNames.length ? (
				<div className="grid overflow-y-auto">
					<table className="divide-y-2 divide-neutral-200">
						<thead>
							<tr className="divide-x-2 divide-neutral-200 *:p-4 *:font-medium">
								<th className="text-neutral-500">#</th>
								<th>File Name</th>
							</tr>
						</thead>
						<tbody className="divide-y-2 divide-neutral-200">
							{listAudio.data.fileNames.map((fileName, i) => (
								<tr className="divide-x-2 divide-neutral-200 *:p-4" key={fileName}>
									<td className="text-neutral-500">{i + 1}</td>
									<td className="inline-grid">
										<p className="w-full overflow-hidden text-ellipsis whitespace-nowrap">{fileName}</p>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : listAudio.isLoading ? (
				<p>Loading audio files...</p>
			) : (
				<p>No audio files found.</p>
			)}
		</div>
	);
};
