import type {
  ListResourcesResult,
  ReadResourceRequest,
  ReadResourceResult,
  Resource,
} from "@modelcontextprotocol/sdk/types.js";
import { RESOURCES } from "../constants/resources.js";
import { TaskStore } from "../services/task-store.js";
import { logger } from "../utils/logger.js";
import { matchResourceTemplate } from "./resource-templates-handler.js";
import { createTaskResourceContent, type TaskResourceContent, type TaskSession, type TaskMetadata } from "../types/resources/task-resource.js";

export async function handleListResources(): Promise<ListResourcesResult> {
  try {
    // Start with static resources
    const resources: Resource[] = [...RESOURCES];

    // Add dynamic task resources
    const taskStore = TaskStore.getInstance();
    const tasks = await taskStore.getTasks();
    tasks.forEach((task) => {
      resources.push({
        uri: `task://${task.id}`,
        name: `Task: ${task.description}`,
        mimeType: "application/json",
        description: `${task.description} (Status: ${task.status})`,
      });
    });

    // Task output resources removed - consolidated into main task resources

    logger.debug(
      `📚 Listing ${resources.length} resources (${RESOURCES.length} static, ${tasks.length} tasks)`,
    );

    return { resources };
  } catch (error) {
    throw new Error(`Failed to list resources: ${error}`);
  }
}

export async function handleResourceCall(
  request: ReadResourceRequest,
  _extra?: any,
): Promise<ReadResourceResult> {
  try {
    const { uri } = request.params;
    const taskStore = TaskStore.getInstance();

    // Handle agent status
    if (uri === "agent://status") {
      const tasks = await taskStore.getTasks();
      const activeTasks = tasks.filter((t) => t.status === "in_progress");

      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                status: "ready",
                version: "1.0.0",
                capabilities: ["claude", "gemini", "task-management"],
                activeTaskCount: activeTasks.length,
                totalTaskCount: tasks.length,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    // Handle task list
    if (uri === "task://list" || uri === "agent://tasks") {
      const tasks = await taskStore.getTasks();
      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                count: tasks.length,
                tasks: tasks.map((task) => ({
                  id: task.id,
                  description: task.description,
                  status: task.status,
                  created_at: task.created_at,
                  updated_at: task.updated_at,
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    }


    // Handle individual task resources
    if (uri.startsWith("task://")) {
      const taskId = uri.replace("task://", "");
      const task = await taskStore.getTask(taskId);

      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      // Get session info
      const { AgentManager } = await import("../services/agent-manager/index.js");
      const agentManager = AgentManager.getInstance();
      const sessions = agentManager.getAllSessions();
      const taskSession = sessions.find(s => s.taskId === taskId);
      
      let session: TaskSession | undefined;
      let metadata: TaskMetadata | undefined;
      
      if (taskSession) {
        session = {
          id: taskSession.id,
          type: taskSession.type,
          status: taskSession.status
        };
      }
      
      // Extract metadata from result if available
      if (task.result && typeof task.result === 'object' && 'duration_ms' in task.result) {
        const result = task.result as any;
        metadata = {
          duration_ms: result.duration_ms,
          cost_usd: result.total_cost_usd,
          tokens: result.usage ? {
            input: result.usage.input_tokens || 0,
            output: result.usage.output_tokens || 0,
            cached: (result.usage.cache_creation_input_tokens || 0) + (result.usage.cache_read_input_tokens || 0)
          } : undefined
        };
      }

      // Build clean resource
      const processResource: TaskResourceContent = createTaskResourceContent(
        task,
        session,
        metadata
      );

      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType: "application/json",
            text: JSON.stringify(processResource, null, 2),
          },
        ],
      };
    }

    // Handle active sessions (placeholder for now)
    if (uri === "agent://sessions") {
      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                sessions: [],
                count: 0,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    // Try to match against resource templates
    const templateMatch = matchResourceTemplate(uri);
    if (templateMatch) {
      const { template, params } = templateMatch;
      logger.debug(`📋 Matched resource template: ${template.name}`, params);

      // Handle task logs template
      if (uri.match(/^task:\/\/[^\/]+\/logs$/)) {
        const taskId = params.taskId;
        const task = await taskStore.getTask(taskId);
        if (!task) {
          throw new Error(`Task not found: ${taskId}`);
        }
        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: "text/plain",
              text: task.logs.join("\n") || "No logs available",
            },
          ],
        };
      }

      // Handle task result template
      if (uri.match(/^task:\/\/[^\/]+\/result$/)) {
        const taskId = params.taskId;
        const task = await taskStore.getTask(taskId);
        if (!task) {
          throw new Error(`Task not found: ${taskId}`);
        }
        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: "application/json",
              text: JSON.stringify(task.result || { message: "No result available" }, null, 2),
            },
          ],
        };
      }

      // Handle session template
      if (uri.match(/^session:\/\/[^\/]+\/[^\/]+$/)) {
        const { sessionType, sessionId } = params;
        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  type: sessionType,
                  id: sessionId,
                  status: "placeholder",
                  message: "Session details not yet implemented",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // Handle branch tasks template
      if (uri.match(/^branch:\/\/[^\/]+\/tasks$/)) {
        const { branchName } = params;
        const tasks = await taskStore.getTasks();
        // Branch filtering removed - returning empty array
        const branchTasks: typeof tasks = [];
        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  branch: branchName,
                  count: branchTasks.length,
                  tasks: branchTasks.map((t) => ({
                    id: t.id,
                    description: t.description,
                    status: t.status,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // Handle project status template
      if (uri.match(/^project:\/\/[^\/]+\/status$/)) {
        const { projectPath } = params;
        const tasks = await taskStore.getTasks();
        // Project filtering by branch removed - returning empty array
        const projectTasks: typeof tasks = [];
        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  project: projectPath,
                  taskCount: projectTasks.length,
                  activeTasks: projectTasks.filter((t) => t.status === "in_progress").length,
                  completedTasks: projectTasks.filter((t) => t.status === "completed").length,
                  status: "active",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // Handle log template
      if (uri.match(/^log:\/\/[^\/]+\/[^\/]+$/)) {
        const { logType, date } = params;
        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: "text/plain",
              text: `Logs for ${logType} on ${date}\n\nLog retrieval not yet implemented.`,
            },
          ],
        };
      }
    }

    throw new Error(`Unknown resource: ${uri}`);
  } catch (error) {
    throw new Error(`Failed to read resource: ${error}`);
  }
}
