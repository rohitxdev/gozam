import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { LuCheck, LuCopy, LuRotateCw, LuTriangleAlert } from "react-icons/lu";
import { useRef, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/react-query";

export const links: Route.LinksFunction = () => [
	{ rel: "preconnect", href: "https://fonts.googleapis.com" },
	{
		rel: "preconnect",
		href: "https://fonts.gstatic.com",
		crossOrigin: "anonymous",
	},
	{
		rel: "stylesheet",
		href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&family=Rubik:ital,wght@0,300..900;1,300..900&display=swap",
	},
];

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<Meta />
				<Links />
			</head>
			<body className="grid min-h-screen max-w-screen grid-rows-1 bg-neutral-100 p-4 antialiased">
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<Outlet />
		</QueryClientProvider>
	);
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
	const copyTimeoutIdRef = useRef<number | null>(null);
	const isRouteError = isRouteErrorResponse(error);
	let message = "Oops!";
	let details = "An unexpected error occurred.";
	let stack: string | undefined;

	if (isRouteError) {
		message = error.status === 404 ? "404" : "Error";
		details = error.status === 404 ? "The requested page could not be found." : error.statusText || details;
	} else if (import.meta.env.DEV && error && error instanceof Error) {
		details = error.message;
		stack = error.stack;
	}

	return (
		<main className="absolute inset-0 grid place-content-center">
			<div className="w-[90vw] max-w-screen-lg space-y-4 rounded-xl bg-white p-8 shadow">
				<div className="flex items-start justify-between">
					<div className="space-y-2">
						<h1 className="text-3xl">
							<LuTriangleAlert className="mr-2 inline size-10 fill-yellow-300 text-black" />
							{message}
						</h1>
						<p>{details}</p>
					</div>
					<button
						className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm text-white"
						onClick={() => {
							if (isRouteError) {
								window.location.href = "/";
							} else {
								window.location.reload();
							}
						}}
					>
						{isRouteError ? (
							<span>Go to Home</span>
						) : (
							<>
								<LuRotateCw className="size-4" />
								<span>Reload</span>
							</>
						)}
					</button>
				</div>
				{stack && (
					<div className="relative rounded-lg bg-neutral-100">
						<pre className="max-h-128 w-full overflow-y-auto whitespace-break-spaces p-8 text-red-600 text-sm">
							<code>{stack}</code>
						</pre>
						<button
							className="absolute top-4 right-4 rounded p-2 text-black transition-colors duration-100 *:size-5 hover:bg-neutral-200"
							onClick={() => {
								navigator.clipboard.writeText(stack);
								setCopyState("copied");
								if (copyTimeoutIdRef.current) clearTimeout(copyTimeoutIdRef.current);
								copyTimeoutIdRef.current = window.setTimeout(() => setCopyState("idle"), 2000);
							}}
						>
							{copyState === "idle" ? <LuCopy /> : <LuCheck />}
						</button>
					</div>
				)}
			</div>
		</main>
	);
}
