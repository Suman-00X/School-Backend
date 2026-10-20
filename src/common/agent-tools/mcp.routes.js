import { authorize } from "../auth/authorize.middleware.js";
import { createRouter } from "../http/router.js";
import { documented } from "../openapi/openapi.js";
import { logger } from "../logging/logger.js";
import { reportError } from "../observability/errorReporter.js";
import { AppError } from "../http/errors.js";
import { ok } from "../http/responses.js";
import {
  AGENT_TOOL_PERMISSIONS as can,
  describeTool,
  findTool,
  invokeTool,
  toolError,
  toolsFor
} from "./agentTools.js";
import { auditToolCall } from "./agentTools.routes.js";

/* /api/v1/mcp: the agent tools as a Model Context Protocol server (Streamable HTTP, stateless).
   Each POST is one JSON-RPC 2.0 message and gets one JSON response; there is no event stream
   (a GET asking for one answers 405), no sessions and no batches. The caller signs in like any API client
   (Authorization: Bearer <access token>), so tools run as that user, in their school.

   Methods: initialize, notifications/initialized, ping, tools/list, tools/call. A failing tool
   is a tool result with isError (the agent reads why); a malformed call is a JSON-RPC error. */

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_INFO = { name: "school-backend", title: "School management", version: "1.0.0" };
const INSTRUCTIONS =
  "Tools for one school's data, acting as the signed-in user. Generating a timetable only makes a draft: " +
  "review it (get_timetable_draft), then apply it (apply_timetable_draft) once the person you work for agrees.";

const rpcError = (id, code, message, data) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message, ...(data && { data }) }
});
const rpcResult = (id, result) => ({ jsonrpc: "2.0", id, result });

const callTool = async (req, res, { name, arguments: input } = {}) => {
  const tool = typeof name === "string" ? findTool(name) : null;
  if (!tool) return { unknown: true };
  try {
    const result = await invokeTool(req.context, name, input ?? {});
    auditToolCall(res, tool, result);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 1) }],
      structuredContent: result,
      isError: false
    };
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error({ err: error, tool: name }, "Agent tool failed");
      reportError(error, { source: "agent-tool", tool: name, tenantId: req.context?.tenantId });
    }
    res.locals.skipAudit = true;
    const failure = toolError(error);
    return { content: [{ type: "text", text: failure.message }], structuredContent: { error: failure }, isError: true };
  }
};

const handle = async (req, res, message) => {
  const { id, method, params } = message;
  switch (method) {
    case "initialize": {
      const requested = params?.protocolVersion;
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: (await toolsFor(req.context)).map(tool => describeTool(tool)) });
    case "tools/call": {
      const result = await callTool(req, res, params);
      if (result.unknown) return rpcError(id, -32602, `Unknown tool: ${params?.name}`);
      return rpcResult(id, result);
    }
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
};

const router = createRouter();

router.post("/", authorize(can.use), documented({ summary: "MCP endpoint" }), async (req, res) => {
  const message = req.body;
  if (Array.isArray(message)) {
    res.locals.skipAudit = true;
    return res
      .status(400)
      .json(rpcError(null, -32600, "Batches are not supported: send one JSON-RPC message per request"));
  }
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    res.locals.skipAudit = true;
    return res.status(400).json(rpcError(message?.id, -32600, "Invalid JSON-RPC 2.0 message"));
  }
  /* notifications and responses from the client: acknowledged, nothing to return */
  if (message.id === undefined || message.id === null) {
    res.locals.skipAudit = true;
    return res.status(202).end();
  }
  if (message.method !== "tools/call") res.locals.skipAudit = true;
  res.json(await handle(req, res, message));
});

/* An MCP client opening an event stream gets 405 (there is none); anyone else, how to connect */
router.get("/", authorize(can.use), (req, res) => {
  if ((req.get("accept") ?? "").includes("text/event-stream")) {
    res.locals.skipAudit = true;
    return res
      .set("Allow", "POST")
      .status(405)
      .json(rpcError(null, -32000, "This MCP server answers POST requests only (no event stream)"));
  }
  ok(
    res,
    {
      ...SERVER_INFO,
      transport: "streamable-http",
      protocolVersions: PROTOCOL_VERSIONS,
      methods: ["initialize", "ping", "tools/list", "tools/call"],
      instructions: INSTRUCTIONS
    },
    "MCP endpoint: POST one JSON-RPC 2.0 message per request"
  );
});

export default router;
