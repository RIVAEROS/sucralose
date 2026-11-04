import _ from "lodash";
import Toasts from "../Components/Toasts";
import UserStore from "./Stores/UserStore";

export default new class E621API {
	endpoints = {
		"e621.net": "https://e621.net/",
		"e6ai.net": "https://e6ai.net/"
	};

	sfwEndpoint = "https://e926.net/";

	source = localStorage.getItem("source") || "e621.net";

	get loginData() {
		const localUser = UserStore.getLocalUser() ?? {};

		const creds = this.source === "e6ai.net"
			? { login: localUser.aiUsername, api_key: localUser.aiApiKey }
			: { login: localUser.username, api_key: localUser.apiKey };

		return creds;
	}

	/**
	 * Switches the active API source.
	 * @param source {string} The source to switch to. Must be a key of `endpoints`.
	 */
	setSource(source) {
		if (!this.endpoints[source])
			return console.warn(`Attempted to switch to invalid API source "${source}".`);

		this.source = source;
		localStorage.setItem("source", source);
	}

	get endpoint() {
		return this.endpoints[this.source] ?? this.endpoints["e621.net"];
	}

	/**
	 * Gets a request-able URL to the E621 API endpoint.
	 * @param sub {string} The page to request.
	 * @param args The arguments to pass to the request as a string.
	 * @param json {boolean} Whether to request from the json endpoint.
	 * @param options {{ clientParam?: boolean }} Request options.
	 * @returns {string} An endpoint URL.
	 */
	getEndpoint(sub, args = {}, json = true, options = {}) {
		const { clientParam = true } = options;

		// Create the request params object.
		const params = new URLSearchParams({
			...args,
			...(clientParam ? { _client: "Sucralose/2.0 by RIVÆROS" } : {})
		});

		const nsfw = (localStorage.getItem("showNsfw") || "false") === "true";

		// Return the request string.
		return `${nsfw ? this.endpoint : this.sfwEndpoint}${sub}${json ? ".json?" : "?"}${params}`;
	}

	/**
	 * Recursively normalizes API response data.
	 * Currently, this remaps e6ai's "director" tag category to "artist",
	 * as its API is identical to e621's with the exception of this naming.
	 * @param data {*} The response data to normalize.
	 * @returns {*} The normalized response data.
	 */
	#normalizeData(data) {
		if (!data || typeof data !== "object")
			return data;

		if (Array.isArray(data))
			return data.map(item => this.#normalizeData(item));

		const { tags } = data;

		// Remap e6ai's "director" tag category to "artist".
		if (tags && typeof tags === "object" && !Array.isArray(tags) && Array.isArray(tags.director)) {
			tags.artist = [...(tags.artist ?? []), ...tags.director];

			delete tags.director;
		}

		for (const key in data)
			if (data[key] && typeof data[key] === "object")
				data[key] = this.#normalizeData(data[key]);

		return data;
	}

	/**
	 * Make a request to the E621 API endpoint.
	 * @param sub {string} The page to request from the E621 API endpoint.
	 * @param args The arguments to pass to the request as a string.
	 * @param json {boolean} Whether to request from the json endpoint.
	 * @param restOptions The options argument to pass to the fetch request.
	 * @returns {Promise<any>} A promise that resolves when the request has been made.
	 */
	async request(sub, args = {}, json = true, restOptions = {}) {
		// Rate limit for requests made.
		while (Date.now() - this.lastMadeRequest < 500)
			await new Promise(r => setTimeout(r, 50));
		// Set the last made request to the current time.
		this.lastMadeRequest = Date.now();

		// Apply authorization, if valid
		const { login, api_key } = this.loginData;
		login && api_key && _.set(restOptions, ["headers", "authorization"], "Basic " + btoa(`${login}:${api_key}`));

		// Return the response object.
		return await fetch(this.getEndpoint(sub, args, json), restOptions)
			.then(response => json
				? response.json().then(data => this.source === "e6ai.net" ? this.#normalizeData(data) : data)
				: response).catch(err => {
				console.error(err);
				Toasts.showToast(
					<span>
						A network request error was detected. This could mean nothing, but if you are experiencing issues, visit <a href="https://e621.net">e621.net</a> and confirm that all is in working order.
					</span>,
					"Failure",
					12
				)
			});
	}

	/**
	 * The last time a request was made to the E621 API endpoint.
	 * @type {number}
	 */
	lastMadeRequest = -500;

	#voting = {};

	/**
	 * Handles voting/un-voting on a post.
	 * @param postId {number} The ID of the post.
	 * @param score {number | "-1" | "1"} The score to assign to the post.
	 * @returns {Promise<*>}
	 */
	async vote(postId, score) {
		const { login, api_key } = this.loginData;
		// If the user is not signed in, throw an error and return.
		if (!login || !api_key)
			return Toasts.showToast(`You must be logged into ${this.source} to vote on posts`, "Failure");

		// If we're already trying to vote on this post, throw an error and return.
		if (this.#voting[postId])
			return Toasts.showToast("You're attempting to vote too quickly", "Failure");
		this.#voting[postId] = true;

		// Make the request to the E621 API.
		return await this.request(
			`posts/${postId}/votes`,
			{ score, no_unvote: false },
			true,
			{ method: "POST" }
		).then(r => (delete this.#voting[postId], r));
	}

	#favoriting = {};

	/**
	 * Handles adding a post to the user's favorites.
	 * @param postId {number} The ID of the post to add.
	 * @returns {Promise<*>}
	 */
	async favorite(postId) {
		const { login, api_key } = this.loginData;
		// If the user is not signed in, throw an error and return.
		if (!login || !api_key)
			return Toasts.showToast(`You must be logged into ${this.source} to favorite posts`, "Failure");

		// If we're already trying to favorite this post, throw an error and return.
		if (this.#favoriting[postId])
			return Toasts.showToast("You're attempting to favorite too quickly", "Failure");
		this.#favoriting[postId] = true;

		// Make the request to the E621 API.
		return await this.request(
			"favorites",
			{ post_id: postId },
			true,
			{ method: "POST" }
		).then(r => (delete this.#favoriting[postId], r));
	}

	/**
	 * Handles deleting a post from the user's favorites.
	 * @param postId {number} The ID of the post to remove.
	 * @returns {Promise<*>}
	 */
	async removeFavorite(postId) {
		const { login, api_key } = this.loginData;
		// If the user is not signed in, throw an error and return.
		if (!login || !api_key)
			return Toasts.showToast(`You must be logged into ${this.source} to favorite posts!`);

		// If we're already trying to favorite this post, throw an error and return.
		if (this.#favoriting[postId])
			return Toasts.showToast("You're attempting to favorite too quickly", "Failure");
		this.#favoriting[postId] = true;

		// Make the request to the E621 API.
		return await this.request(
			`favorites/${postId}.json`,
			{},
			false,
			{ method: "DELETE" }
		).then(r => (delete this.#favoriting[postId], r)).catch(err => {
			console.error(err);

			// For when they inevitably still haven't fixed this issue.
			Toasts.showToast(
				<>
					Due to an API issue on e621's side, it is currently impossible to unfavorite posts via their API. Please <a href={`https://e621.net/posts/${postId}#remove-fav-button`}>click here</a> to manually unfavorite it.
				</>,
				"Failure",
				10
			);
		});
	}
}