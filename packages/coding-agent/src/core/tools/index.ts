export { bashTool } from "./bash.js";
export { editTool } from "./edit.js";
export { type FindToolDetails, findTool } from "./find.js";
export { type GrepToolDetails, grepTool } from "./grep.js";
export { type LsToolDetails, lsTool } from "./ls.js";
export type { TruncationResult } from "./truncate.js";
export { processTool } from "./process.js";
export { type ReadToolDetails, readTool } from "./read.js";
export { writeTool } from "./write.js";

import { bashTool } from "./bash.js";
import { editTool } from "./edit.js";
import { findTool } from "./find.js";
import { grepTool } from "./grep.js";
import { lsTool } from "./ls.js";
import { processTool } from "./process.js";
import { readTool } from "./read.js";
import { writeTool } from "./write.js";

// Default tools for full access mode
export const codingTools = [readTool, bashTool, editTool, writeTool];

// All available tools (including read-only exploration tools)
export const allTools = {
	read: readTool,
	bash: bashTool,
	edit: editTool,
	write: writeTool,
	grep: grepTool,
	find: findTool,
	ls: lsTool,
	process: processTool,
};

export type ToolName = keyof typeof allTools;
