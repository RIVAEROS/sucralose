import API from "../../Classes/API";
import Dropdown, { DropdownItem } from "../Dropdown";

export const Sources = {
	"e621.net": "e621.net",
	"e6ai.net": "e6ai.net"
};

export default function SourceDropdown({ onChange }) {
	const nsfw = (localStorage.getItem("showNsfw") || "false") === "true";

	if (!nsfw) return null;

	return (
		<div className="Sources FlexCenter">
			<h2 className="Label">Source</h2>

			<Dropdown value={API.source} onChange={onChange}>
				{Object.keys(Sources).map(key => (
					<DropdownItem key={key} value={Sources[key]}>{key}</DropdownItem>
				))}
			</Dropdown>
		</div>
	);
}
