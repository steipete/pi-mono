import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { getMarkdownTheme, theme } from "../theme/theme.js";
import { DynamicBorder } from "./dynamic-border.js";

export interface JobLogMeta {
	sessionId: string;
	status: "running" | "completed" | "failed";
	command: string;
	runtimeMs?: number;
	exitCode?: number | null;
	exitSignal?: number | NodeJS.Signals | null;
	truncated?: boolean;
}

export class JobLogView extends Container {
	private readonly onClose: () => void;
	private readonly onKillOrClear?: () => void;
	private readonly onBack?: () => void;
	private readonly meta: JobLogMeta;

	constructor(
		meta: JobLogMeta,
		logText: string,
		onClose: () => void,
		onKillOrClear?: () => void,
		onBack?: () => void,
	) {
		super();
		this.meta = meta;
		this.onClose = onClose;
		this.onKillOrClear = onKillOrClear;
		this.onBack = onBack;
		this.build(logText);
	}

	handleInput(keyData: string): void {
		if (keyData === "\x1b" || keyData === " " || keyData === "\r" || keyData === "\n") {
			this.onClose();
			return;
		}
		if (keyData === "\x1b[D" && this.onBack) {
			this.onBack();
			return;
		}
		if ((keyData === "k" || keyData === "K") && this.onKillOrClear) {
			this.onKillOrClear();
			return;
		}
	}

	private build(logText: string): void {
		this.clear();
		const statusColor =
			this.meta.status === "running" ? "accent" : this.meta.status === "completed" ? "success" : "error";

		this.addChild(new DynamicBorder());
		this.addChild(new Text(theme.bold(theme.fg("accent", "Background tasks")), 1, 0));
		this.addChild(new Text(theme.fg("muted", `${this.meta.sessionId.slice(0, 8)} • ${this.meta.command}`), 1, 0));
		this.addChild(new Spacer(1));

		const statusLine = `${capitalize(this.meta.status)}${
			this.meta.exitSignal != null
				? ` (signal ${this.meta.exitSignal})`
				: this.meta.exitCode != null
					? ` (code ${this.meta.exitCode})`
					: ""
		}`;
		this.addChild(new Text(theme.fg(statusColor, `Status: ${statusLine}`), 1, 0));
		if (this.meta.runtimeMs !== undefined) {
			this.addChild(new Text(theme.fg("muted", `Runtime: ${formatDuration(this.meta.runtimeMs)}`), 1, 0));
		}
		this.addChild(new Spacer(1));

		this.addChild(new Text(theme.bold("Stdout/Stderr:"), 1, 0));
		const content = logText.trim() || "(no output)";
		this.addChild(new Markdown(content, 1, 0, getMarkdownTheme()));
		if (this.meta.truncated) {
			this.addChild(new Text(theme.fg("warning", "(output truncated to cap)"), 1, 0));
		}

		this.addChild(new Spacer(1));
		const killLabel = this.meta.status === "running" ? "k to kill" : "k to clear";
		const nav = this.onBack
			? `← to go back · Esc/Enter/Space to close · ${killLabel}`
			: `Esc/Enter/Space to close · ${killLabel}`;
		this.addChild(new Text(theme.fg("muted", nav), 1, 0));
		this.addChild(new DynamicBorder());
	}
}

function capitalize(input: string) {
	return input.charAt(0).toUpperCase() + input.slice(1);
}

function formatDuration(ms: number) {
	if (!Number.isFinite(ms) || ms < 0) return "";
	if (ms < 1000) return `${Math.round(ms)}ms`;
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const remSeconds = seconds % 60;
	if (minutes === 0) return `${seconds}s`;
	return `${minutes}m ${remSeconds.toString().padStart(2, "0")}s`;
}
