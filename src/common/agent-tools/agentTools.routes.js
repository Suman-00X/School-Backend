import { authorize } from "../auth/authorize.middleware.js";
import { createRouter } from "../http/router.js";
import { documented } from "../openapi/openapi.js";
import { ok } from "../http/responses.js";
import { AGENT_TOOL_PERMISSIONS as can, describeTool, findTool, invokeTool, toolsFor } from "./agentTools.js";

/* The audit trail records a tool's writes under its permission; read-only tools are not writes */
export const auditToolCall = (res, tool, result) => {
  if (tool.readOnly) {
    res.locals.skipAudit = true;
    return;
  }
  res.locals.permission = tool.permission.key;
  if (result?.message) res.locals.summary = result.message;
  if (result?.runId) res.locals.entityId = result.runId;
};

/* /api/v1/agent-tools: the tools over plain REST, for agents and integrations that do not speak MCP.
   GET lists the tools the caller may use (?format=anthropic gives Messages API tool definitions);
   POST /:name runs one with the body as its input. */
const router = createRouter();

router.get("/", authorize(can.use), documented({ summary: "List agent tools" }), async (req, res) => {
  const format = req.query.format === "anthropic" ? "anthropic" : "mcp";
  const tools = (await toolsFor(req.context)).map(tool => describeTool(tool, format));
  ok(res, tools, `${tools.length} tools available`);
});

router.post("/:name", authorize(can.use), documented({ summary: "Call an agent tool" }), async (req, res) => {
  const tool = findTool(req.params.name);
  const result = await invokeTool(req.context, req.params.name, req.body);
  auditToolCall(res, tool, result);
  ok(res, result, result?.message ?? `${req.params.name} completed`);
});

export default router;
