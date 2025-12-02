import type { ChildProcessWithoutNullStreams } from "child_process";

export interface ProcessSession {
	id: string;
	child: ChildProcessWithoutNullStreams;
	startedAt: number;
	cwd?: string;
	maxOutputChars: number;
	pendingStdout: string[];
	pendingStderr: string[];
	aggregated: string;
	tail: string;
	exitCode?: number | null;
	exitSignal?: NodeJS.Signals | number | null;
	exited: boolean;
}

const sessions = new Map<string, ProcessSession>();

export function addSession(session: ProcessSession) {
	sessions.set(session.id, session);
}

export function getSession(id: string) {
	return sessions.get(id);
}

export function deleteSession(id: string) {
	sessions.delete(id);
}

export function appendOutput(session: ProcessSession, stream: "stdout" | "stderr", chunk: string) {
	session.pendingStdout ??= [];
	session.pendingStderr ??= [];
	const buffer = stream === "stdout" ? session.pendingStdout : session.pendingStderr;
	buffer.push(chunk);
	session.aggregated = trimWithCap(session.aggregated + chunk, session.maxOutputChars);
	session.tail = tail(session.aggregated, 2000);
}

export function drainSession(session: ProcessSession) {
	const stdout = session.pendingStdout.join("");
	const stderr = session.pendingStderr.join("");
	session.pendingStdout = [];
	session.pendingStderr = [];
	return { stdout, stderr };
}

export function markExited(
	session: ProcessSession,
	exitCode: number | null,
	exitSignal: NodeJS.Signals | number | null,
) {
	session.exited = true;
	session.exitCode = exitCode;
	session.exitSignal = exitSignal;
}

export function tail(text: string, max = 2000) {
	if (text.length <= max) return text;
	return text.slice(text.length - max);
}

export function trimWithCap(text: string, max: number) {
	if (text.length <= max) return text;
	return text.slice(text.length - max);
}

export function listSessions() {
	return Array.from(sessions.values());
}
