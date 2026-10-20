import { z } from "../validation/zod.js";
import { definePermissions } from "../auth/authorize.middleware.js";
import { hasPermission } from "../auth/grants.js";
import { ROLE_GROUPS } from "../auth/roles.js";
import { AppError, forbidden, notFound, validationError } from "../http/errors.js";

/* Agent tools: module features an AI agent can call, each described for the model that
   reads it. A tool is a name, a description, a zod input schema (sent to the agent as JSON
   Schema), the permission it needs and a handler:

     export const generateTimetable = defineTool({
       name: "generate_class_timetable",
       title: "Generate a class timetable",
       description: "Plans … Returns a draft; nothing changes until apply_timetable_draft.",
       input: classTimetableRequest,
       permission: SCHEDULING_PERMISSIONS.generate,
       readOnly: false,
       handler: async (ctx, input) => ({ runId, summary, … })
     });

   An agent acts as the signed-in user who connected it: the same token, school, role and
   grants, so a tool can never do more than that person could do through the API. The tools
   are served over REST (/api/v1/agent-tools) and MCP (/api/v1/mcp); see their routes.
   Modules list their tool files in src/agentTools.js. */

/* Who may connect an agent at all (the REST and MCP routes); each tool also needs its own
   permission. A school can grant it to more people, or keep agents to its administrators. */
export const AGENT_TOOL_PERMISSIONS = definePermissions("administration.agentTools", {
  use: { roles: ROLE_GROUPS.ALL_EMPLOYEES, label: "Use AI agent tools (each tool also needs its own permission)" }
});

const tools = new Map();
const NAME = /^[a-z][a-z0-9_]{2,63}$/;

export const defineTool = ({
  name,
  title,
  description,
  input,
  permission,
  readOnly = false,
  destructive = false,
  idempotent = false,
  handler
}) => {
  if (!NAME.test(name)) throw new Error(`defineTool(): "${name}" must be snake_case, 3-64 characters`);
  if (tools.has(name)) throw new Error(`defineTool(): "${name}" is already defined`);
  if (!permission?.key) throw new Error(`defineTool(${name}): expects a permission created with definePermissions()`);
  if (!(input instanceof z.ZodType)) throw new Error(`defineTool(${name}): expects a zod input schema`);
  const tool = Object.freeze({
    name,
    title,
    description,
    input,
    permission,
    readOnly,
    destructive,
    idempotent,
    handler
  });
  tools.set(name, tool);
  return tool;
};

const inputSchemaOf = schema => {
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
  delete json.$schema;
  return { type: "object", ...json };
};

/* How a tool is described to an agent (MCP's tool shape; `anthropic` gives the Messages API's) */
export const describeTool = (tool, format = "mcp") => {
  const inputSchema = inputSchemaOf(tool.input);
  if (format === "anthropic") return { name: tool.name, description: tool.description, input_schema: inputSchema };
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema,
    annotations: {
      title: tool.title,
      readOnlyHint: tool.readOnly,
      destructiveHint: tool.destructive,
      idempotentHint: tool.idempotent,
      openWorldHint: false
    },
    permission: tool.permission.key
  };
};

/* The tools this user may call */
export const toolsFor = async ctx => {
  const allowed = [];
  for (const tool of tools.values()) if (await hasPermission(ctx, tool.permission)) allowed.push(tool);
  return allowed;
};

export const findTool = name => tools.get(name) ?? null;

/* Validate, authorize and run a tool -> its result. Throws AppErrors like any service. */
export const invokeTool = async (ctx, name, rawInput, { origin = "AGENT_TOOL" } = {}) => {
  const tool = tools.get(name);
  if (!tool) throw notFound(`Tool ${name}`);
  if (!(await hasPermission(ctx, tool.permission))) throw forbidden(`You do not have permission to use ${name}`);
  const parsed = tool.input.safeParse(rawInput ?? {});
  if (!parsed.success) {
    const details = parsed.error.issues.map(issue => ({
      field: issue.path.join(".") || "input",
      message: issue.message
    }));
    const summary = details
      .slice(0, 3)
      .map(d => `${d.field} ${d.message}`)
      .join("; ");
    throw validationError(`Invalid input for ${name}: ${summary}${details.length > 3 ? "; ..." : ""}`, details);
  }
  return tool.handler(ctx, parsed.data, { origin });
};

/* An error as a tool result an agent can act on: what went wrong and the status it maps to */
export const toolError = error =>
  error instanceof AppError
    ? {
        code: error.code,
        status: error.status,
        message: error.message,
        ...(error.details && { details: error.details })
      }
    : { code: "INTERNAL_ERROR", status: 500, message: "The tool failed unexpectedly. Try again later." };
