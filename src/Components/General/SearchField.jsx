import _ from "lodash";
import React from "react";
import * as Feather from "react-feather";
import API from "../../Classes/API";
import { ActionTypes, joinClassNames, openFileDialog } from "../../Classes/Constants";
import { copyToClipboard } from "../Modals";
import { dispatcher } from "../../Classes/Dispatcher";
import QueryManager from "../../Classes/QueryManager";
import RoutesStore from "../../Classes/Stores/RoutesStore";
import InlineLoading from "../InlineLoading";
import Toasts from "../Toasts";
import Tooltip from "../Tooltip";
import "./SearchField.scss";

// Create the tag icon types.
export const TagTypes = {
	0: { icon: <Feather.Hash />, tooltip: "General" },
	1: { icon: <Feather.Edit2 />, tooltip: "Artist" },
	3: { icon: <Feather.Award />, tooltip: "Copyright" },
	4: { icon: <Feather.User />, tooltip: "Character" },
	5: { icon: <Feather.Activity />, tooltip: "Species" },
	6: { icon: <Feather.AlertTriangle />, tooltip: "Invalid" },
	7: { icon: <Feather.AlignCenter />, tooltip: "Meta" },
	8: { icon: <Feather.BookOpen />, tooltip: "Lore" }
};

/**
 * Finds the bounds of the tag (whitespace-delimited word) at the cursor's position.
 * @param value {string} The input's text content.
 * @param cursor {number} The cursor's index in the string.
 * @returns {[number, number]} The [start, end] indices of the tag.
 */
function getTagBounds(value, cursor) {
	// Clamp the cursor into the string, so clicking before/after text works.
	cursor = Math.min(Math.max(cursor, 0), value.length);

	// Expand left from the cursor until whitespace or the start of the string.
	let start = cursor;
	while (start > 0 && !/\s/.test(value[start - 1]))
		start--;

	let end = cursor;

	if (end > start) {
		// The cursor is inside a word - expand right until whitespace or the end.
		while (end < value.length && !/\s/.test(value[end]))
			end++;
	}
	else {
		// The cursor is in whitespace - use the tag behind it, if there is one.
		while (end > start && /\s/.test(value[end - 1]))
			end--;

		start = end;
		while (start > 0 && !/\s/.test(value[start - 1]))
			start--;
	}

	return [start, end];
}

/**
 * Gets the tag (whitespace-delimited word) at the cursor's position.
 * @param value {string} The input's text content.
 * @param cursor {number} The cursor's index in the string.
 * @returns {string} The tag at the cursor.
 */
function getTagAtCursor(value, cursor) {
	const [start, end] = getTagBounds(value, cursor);

	return value.slice(start, end);
}

export default function SearchField({
	placeholder = "Search..."
}) {
	const [focused, setFocused] = React.useState(false);
	const [autoCompleteEntries, setAutoCompleteEntries] = React.useState([]);
	const ref = React.useRef();

	const query = QueryManager.useState(() => QueryManager.get("search")) || "";
	const [value, setValue] = React.useState(query);

	React.useEffect(() => {
		setValue(query);
	}, [query]);

	function search(value = null) {
		// If a value was passed, set the value to that.
		if (value) ref.current.value = value;

		if (!RoutesStore.getFormattedRoute()[0]) {
			dispatcher.dispatch({
				type: ActionTypes.UPDATE_ROUTE,
				path: "/posts"
			});
		}

		QueryManager.set("search", ref.current.value);
		QueryManager.set("page", null);
	}

	async function imageSearch() {
		const [file] = await openFileDialog();
		if (!file) return;

		const md5Response = await API.request("posts", { tags: "md5:" + file.name.split(".")[0] }).catch(() => null);
		if (md5Response?.posts?.length) {
			dispatcher.dispatch({
				type: ActionTypes.UPDATE_ROUTE,
				path: `/post/${md5Response.posts[0].id}`
			});

			return;
		}

		Toasts.showToast("Could not find any post by MD5 hash! True image searching will be added soon!", "Failure");

		return;

		const reader = new FileReader();

		reader.onload = async e => {
			const formData = new FormData();
			formData.append("file", e.target.result.split(",")[1]);

			const req = await fetch("https://saucenao.com/search.php", {
				method: "POST",
				mode: "no-cors",
				headers: {
					"Content-Type": "application/json"
				},
				body: new URLSearchParams({
					file,
					output_type: 2,
					api_key: "d7aca1f6f9e269dd42f9897af2e9538421b756e4"
				})
			});
			const results = req;
		};

		reader.readAsDataURL(file);
	}

	// Copies the Atom feed URL for the current search to the clipboard.
	function copyRssFeed() {
		// e.g. https://e621.net/posts.atom?tags=oviraptor+rating:s&login=user&api_key=...
		const { login, api_key } = API.loginData;
		const tags = ref.current.value?.trim();

		const params = { ...(tags ? { tags } : {}) };

		// Authenticate the feed, so subscribed/blacklisted content is included.
		login && api_key && Object.assign(params, { login, api_key });

		const feedUrl = API.getEndpoint("posts.atom", params, false, { clientParam: false });

		copyToClipboard(feedUrl);
	}

	SearchField.handleSearch = search;

	// Create the events object.
	const events = React.useMemo(() => ({
		onFocus: () => setFocused(true),
		onBlur: () => setFocused(false),
		onKeyDown: e => e.key === "Enter" && search(),
		// Fetches auto complete entries for the tag at the cursor's position.
		fetchAutoComplete: async e => {
			// Get the text content of the input.
			const { value, selectionStart } = e.target;

			// Get the search string for the tag at the cursor position.
			const search = getTagAtCursor(value, selectionStart).replace(/[-~*]/g, "");
			// If the search string is empty, clear the state and return.
			if (!search.trim()) return setAutoCompleteEntries([]);

			// Display a loading indicator.
			setAutoCompleteEntries([null]);

			// Fetch the auto complete entries from the api.
			const entries = await API.request("tags", {
				"search[name_matches]": search + "*",
				"search[order]": "count",
				"limit": 10
			});

			try {
				// Set the auto complete entries.
				setAutoCompleteEntries([...(entries || [])]);
			}
			catch (e) {
				setAutoCompleteEntries([]);
			}
		},
		onInput: _.debounce(async e => events.fetchAutoComplete(e), 200),
		// Re-fetch auto complete entries when the caret moves to a different tag.
		onKeyUp: e => ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) && events.fetchAutoComplete(e),
		onClick: e => events.fetchAutoComplete(e),
		onChange: e => {
			const { value } = e.currentTarget;
			setValue(value);
		}
	}), []);

	// Create auto complete entry click handler.
	function handleAutoCompleteEntryClick(tag) {
		// Find the bounds of the tag at the cursor's position.
		const { value, selectionStart } = ref.current;
		const [start, end] = getTagBounds(value, selectionStart);

		// Replace the tag with the clicked entry, preserving any meta prefixes (-/~).
		const prefix = (value.slice(start, end).match(/^[-~]+/) ?? [""])[0];
		const completed = prefix + tag.name;
		const newValue = value.slice(0, start) + completed + " " + value.slice(end);
		const cursorPosition = start + completed.length + 1;

		// Set the input text to the clicked tag name.
		setValue(newValue);

		// Clear the auto complete entries.
		setAutoCompleteEntries([]);

		// Wait for the next frame because JavaScript is shitting through the screen.
		setTimeout(() => {
			// Set the selection index after the completed tag.
			ref.current.selectionStart =
				ref.current.selectionEnd = cursorPosition;

			// Focus the input field element.
			ref.current.focus();
		}, 0);
	}

	return (
		<div className={joinClassNames("SearchFieldContainer", [focused, "Focused"])}>
			<input className="SearchField" {...events} ref={ref}
				id="searchField" autoCorrect="false"
				value={value}
				autoComplete="off"
				placeholder={placeholder} />

			<Feather.Image className="Button" onClick={imageSearch.bind(null, null)} />
			<Feather.Search className="Button" onClick={search.bind(null, null)} />

			<Feather.Rss className="Button" onClick={copyRssFeed}>
				<Tooltip>Copy RSS Feed</Tooltip>
			</Feather.Rss>

			<div className="AutoCompleteContainer">
				{autoCompleteEntries.map(tag => tag === null
					? (
						<div className="AutoCompleteEntry" style={{ padding: 10 }}>
							<InlineLoading key={Date.now().toString(36)} />
						</div>
					) : (
						tag.categoryIcon = TagTypes[tag.category] ?? TagTypes["0"],
						<div className="AutoCompleteEntry" key={tag.id}
							onMouseDown={handleAutoCompleteEntryClick.bind(this, tag)}>
							<div className="IconContainer">
								{tag.categoryIcon.icon}

								<Tooltip>{tag.categoryIcon.tooltip}</Tooltip>
							</div>

							{tag.antecedent_name ? (
								<div className="Title">
									{tag.name} <span style={{ opacity: 0.75 }}>({tag.antecedent_name})</span>
								</div>
							) : <span className="Title">{tag.name}</span>}
							<span className="PostCount">{Intl.NumberFormat().format(tag.post_count)} posts</span>
						</div>
					)
				)}
			</div>
		</div>
	);
}