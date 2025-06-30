import type { Tool } from "@modelcontextprotocol/sdk/types.js";

// Core orchestrator tools
import { createTask } from "./tool/orchestrator/create-task.js";
import { updateTask } from "./tool/orchestrator/update-task.js";
import { endTask } from "./tool/orchestrator/end-task.js";
import { reportTask } from "./tool/orchestrator/report-task.js";
import { checkStatus } from "./tool/orchestrator/check-status.js";
import { cleanState } from "./tool/orchestrator/clean-state.js";
import { getPrompt } from "./tool/orchestrator/get-prompt.js";

/**
 * All available tools in the MCP server
 */
export const TOOLS: Tool[] = [
  createTask,
  updateTask,
  endTask,
  reportTask,
  checkStatus,
  cleanState,
  getPrompt
];