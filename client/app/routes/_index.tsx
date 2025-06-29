import { AudioSearch } from "~/components/audio-search";
import { AudioSave } from "~/components/audio-save";
import { AudioList } from "~/components/audio-list";

export function meta() {
	return [{ title: "New React Router App" }, { name: "description", content: "Welcome to React Router!" }];
}

export default function Home() {
	return (
		<div className="grid grid-rows-[auto_1fr]">
			<div className="mb-4 flex items-center justify-center gap-2">
				<img className="size-16" src="/gozam.png" alt="" />
				<h1 className="bg-gradient-to-tr from-30% from-red-600 to-orange-300 bg-clip-text font-medium text-3xl text-transparent">Gozam</h1>
			</div>
			<div className="grid grid-rows-2 place-content-center gap-4 text-center *:grid *:gap-4 *:rounded-xl *:bg-white *:p-4 *:shadow-md *:ring *:ring-neutral-300 lg:grid-cols-2 lg:*:first:row-span-2 [&_h2]:text-2xl [&_h2]:text-cyan-500">
				<AudioList />
				<AudioSave />
				<AudioSearch />
			</div>
		</div>
	);
}
