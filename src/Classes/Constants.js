export function joinClassNames() {
	let final = "";

	for (let i = 0; i < arguments.length; i++) {
		switch (typeof (arguments[i])) {
			case (Array.isArray(arguments[i]) && typeof (arguments[i][0]) === "boolean" && "object"):
				if (arguments[i][0] === true)
					final += arguments[i][1];
				else if (arguments[i][2])
					final += arguments[i][2];
				break;

			default:
				if (arguments[i])
					final += arguments[i];
				break;
		}

		final += " ";
	}

	return final.trim();
}

export function openFileDialog(options = {}) {
	return new Promise(r => {
		const { type = "*", multiple = false } = options;
		const input = _.assign(document.createElement("input"), {
			type: "file",
			accept: type,
			style: "display:none",
			multiple,
			onchange: () => (
				r(input.files),

				document.body.removeChild(input)
			)
		});

		document.body.appendChild(input);
		input.click();
	});
}

export async function download(uri, filename = null) {
	filename ??= uri.split("/")[uri.split("/").length - 1];

	// Toasts.showToast is a static on the module's default export, not the module namespace.
	const showToast = (...args) =>
		import("../Components/Toasts").then(Toasts => Toasts.default.showToast(...args));

	const saveBlob = blob => {
		const a = Object.assign(document.createElement("a"), {
			style: { display: "none" },
			href: URL.createObjectURL(blob),
			download: filename
		});

		document.body.appendChild(a);
		a.click();
		window.URL.revokeObjectURL(a.href);
		a.remove();
	};

	// Browser-side, cross-origin files can only be blob-fetched if the server permits it via CORS.
	// e621's CDN hard-codes its CORS header to e621.net, so if the direct fetch fails,
	// the file is opened in a new tab where the browser's native save (Ctrl+S) works.
	try {
		const response = await fetch(uri);

		if (!response.ok)
			throw new Error(`Request failed with status ${response.status}`);

		saveBlob(await response.blob());

		showToast(`${filename} downloaded!`, "Success");
	}
	catch (err) {
		console.error(err);

		// Trigger the browser's native download dialog for cross-origin files.
		// The download attribute is ignored cross-origin, so the user must save manually.
		window.open(uri, "_blank");

		showToast("This file can't be downloaded directly, so it's been opened in a new tab - please save it from there.", "Warning", 10);
	}
}

export function getRandomKey() { return Math.random().toString(36).substr(7); }

/**
 * Converts a number of bytes into a user-readable string.
 * Totally not stolen from stackoverflow and tweaked because I've written this exact function 50 times and still can't remember how to do it because fuck math.
 * @param bytes
 * @param decimals
 * @returns {string}
 */
export function formatBytes(bytes, decimals = 2) {
	if (bytes === 0) return "N/A";

	const k = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = [" bytes", "KB", "MB", "GB", "TB"];

	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return (bytes / Math.pow(k, i)).toFixed(dm).toLocaleString() + (sizes[i] ?? sizes[sizes.length - 1]);
}

export const ActionTypes = {
	UPDATE_ROUTE: "UPDATE_ROUTE",
	UPDATE_PAGE: "UPDATE_PAGE",
	UPDATE_QUERY: "UPDATE_QUERY",
	UPDATE_USER: "UPDATE_USER",
	UPDATE_LOCAL_USER: "UPDATE_LOCAL_USER",
	UPDATE_SETTINGS: "UPDATE_SETTINGS",
	QUEUE_TOAST: "QUEUE_TOAST",
	REMOVE_TOAST: "REMOVE_TOAST",
	CLEAR_TOASTS: "CLEAR_TOASTS"
};