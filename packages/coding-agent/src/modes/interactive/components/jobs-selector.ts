import { Container, type SelectItem, SelectList, Text } from "@mariozechner/pi-tui";
import { getSelectListTheme, theme } from "../theme/theme.js";
import { DynamicBorder } from "./dynamic-border.js";

export interface JobItem {
	sessionId: string;
	label: string;
	description?: string;
}

export class JobsSelectorComponent extends Container {
	private selectList?: SelectList;
	private items: JobItem[];
	private readonly onSelect: (sessionId: string) => void;
	private readonly onCancel: () => void;
	private readonly onKill?: (sessionId: string) => void;

	constructor(
		jobs: JobItem[],
		onSelect: (sessionId: string) => void,
		onCancel: () => void,
		onKill?: (sessionId: string) => void,
	) {
		super();
		this.items = jobs;
		this.onSelect = onSelect;
		this.onCancel = onCancel;
		this.onKill = onKill;
		this.rebuild();
	}

	updateItems(jobs: JobItem[]): void {
		this.items = jobs;
		this.rebuild();
	}

	handleInput(keyData: string): void {
		if (keyData === "k" || keyData === "K") {
			const id = this.getSelectedSessionId();
			if (id && this.onKill) {
				this.onKill(id);
			}
			return;
		}
		this.selectList?.handleInput(keyData);
	}

	getSelectedSessionId(): string | null {
		const selected = this.selectList?.getSelectedItem();
		return selected?.value ?? null;
	}

	getSelectList(): SelectList | undefined {
		return this.selectList;
	}

	private rebuild(): void {
		this.clear();

		if (this.items.length === 0) {
			this.addChild(new DynamicBorder());
			this.addChild(new Text(theme.fg("muted", "No running or recent jobs."), 1, 0));
			this.addChild(new DynamicBorder());
			return;
		}

		const items: SelectItem[] = this.items.map((job) => ({
			value: job.sessionId,
			label: job.label,
			description: job.description,
		}));

		this.addChild(new DynamicBorder());
		this.addChild(new Text(theme.fg("muted", "Enter: tail · k: kill · Esc: close · /jobs to refresh"), 1, 0));
		this.selectList = new SelectList(items, Math.min(8, items.length), getSelectListTheme());

		this.selectList.onSelect = (item) => {
			this.onSelect(item.value);
		};

		this.selectList.onCancel = () => {
			this.onCancel();
		};

		this.addChild(this.selectList);
		this.addChild(new DynamicBorder());
	}
}
