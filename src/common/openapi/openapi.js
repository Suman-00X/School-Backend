import { z } from "../validation/zod.js";
import { ERROR_CODES } from "../http/errors.js";

/* Builds an OpenAPI 3.1 document from the live route table (createRouter),
   the zod schemas given to validate(), and the permissions given to authorize().
   Middleware may add `__openapi` ({ parameters, requestBody, summary, description,
   responses }) to describe itself; documented() does that for a route. */

const toJsonSchema = schema => {
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
  delete json.$schema;
  return json;
};

const joinPath = (...parts) => `/${parts.join("/").split("/").filter(Boolean).join("/")}`;

const summaryFor = (method, path, permission) => {
  if (!permission) return `${method.toUpperCase()} ${path}`;
  const parts = permission.key.split(".");
  const action = parts.pop();
  const resource = parts
    .at(-1)
    .replace(/([A-Z])/g, " $1")
    .toLowerCase();
  return `${action.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase())} — ${resource}`;
};

const errorResponse = description => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } }
});

const successResponse = {
  description: "Success",
  content: { "application/json": { schema: { $ref: "#/components/schemas/Success" } } }
};

/* A router flagged `__public = true` (mounted before authentication) marks its routes public */
const collectRoutes = (router, prefix, out, isPublic = false) => {
  const open = isPublic || Boolean(router.__public);
  for (const route of router.__routes) out.push({ ...route, fullPath: joinPath(prefix, route.path), isPublic: open });
  for (const mount of router.__mounts) collectRoutes(mount.router, joinPath(prefix, mount.path), out, open);
  return out;
};

const parametersFrom = (location, schema) => {
  if (!schema) return [];
  const json = toJsonSchema(schema);
  const required = new Set(json.required ?? []);
  return Object.entries(json.properties ?? {}).map(([name, property]) => ({
    name,
    in: location,
    required: location === "path" || required.has(name),
    schema: property
  }));
};

/* A pass-through handler that only describes its route, for what the schemas cannot say:
     router.post("/login", documented({ description, responses: { 200: {...} } }), …) */
export const documented = openapi => {
  const handler = (req, res, next) => next();
  handler.__openapi = openapi;
  return handler;
};

export const buildOpenApi = (rootRouter, { basePath, title, version, description, publicPaths = [] }) => {
  const paths = {};

  for (const route of collectRoutes(rootRouter, basePath, [])) {
    const handlers = route.handlers.flat();
    const schemas = handlers.find(h => h.__schemas)?.__schemas ?? {};
    const permission = handlers.find(h => h.__permission)?.__permission;
    const extras = handlers.filter(h => h.__openapi).map(h => h.__openapi);

    const openApiPath = route.fullPath.replace(/:(\w+)/g, "{$1}");
    const tag = route.fullPath.slice(basePath.length).split("/").filter(Boolean).slice(0, 2).join(" / ");
    const isPublic = route.isPublic || publicPaths.some(p => route.fullPath.startsWith(p));

    const operation = {
      tags: [tag || "general"],
      summary: summaryFor(route.method, openApiPath, permission),
      ...(permission && { description: `Permission \`${permission.key}\`. Roles: ${permission.roles.join(", ")}.` }),
      ...Object.assign(
        {},
        ...extras.map(({ summary, description }) => ({
          ...(summary && { summary }),
          ...(description && { description })
        }))
      ),
      ...(isPublic && { security: [] }),
      parameters: [
        ...parametersFrom("path", schemas.params),
        ...parametersFrom("query", schemas.query),
        ...extras.flatMap(e => e.parameters ?? [])
      ],
      responses: {
        [route.method === "post" ? "201" : "200"]: successResponse,
        400: errorResponse("Invalid request"),
        401: errorResponse("Not signed in"),
        403: errorResponse("Not allowed for your role"),
        404: errorResponse("Not found"),
        409: errorResponse("Duplicate"),
        422: errorResponse("Business rule violated")
      }
    };
    /* A route's own responses: each replaces the default description (2xx keep the Success
       schema); a route that lists its own 2xx answers drops the default one */
    const own = Object.assign({}, ...extras.map(e => e.responses ?? {}));
    const ownSuccess = Object.keys(own).filter(code => code.startsWith("2"));
    if (ownSuccess.length) {
      for (const code of Object.keys(operation.responses)) if (code.startsWith("2")) delete operation.responses[code];
    }
    for (const [code, response] of Object.entries(own)) {
      operation.responses[code] = {
        ...(code.startsWith("2") ? successResponse : (operation.responses[code] ?? errorResponse(""))),
        ...response
      };
    }

    const requestBody = extras.find(e => e.requestBody)?.requestBody;
    if (requestBody) operation.requestBody = requestBody;
    else if (schemas.body) {
      operation.requestBody = {
        required: true,
        content: { "application/json": { schema: toJsonSchema(schemas.body) } }
      };
    }

    paths[openApiPath] ??= {};
    paths[openApiPath][route.method] = operation;
  }

  return {
    openapi: "3.1.0",
    info: { title, version, description },
    servers: [{ url: "/" }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
      schemas: {
        Success: {
          type: "object",
          required: ["success", "message", "data"],
          properties: {
            success: { const: true },
            message: { type: "string" },
            data: {},
            meta: {
              type: "object",
              properties: {
                page: { type: "integer" },
                limit: { type: "integer" },
                total: { type: "integer" },
                totalPages: { type: "integer" }
              }
            }
          }
        },
        Error: {
          type: "object",
          required: ["success", "message", "error"],
          properties: {
            success: { const: false },
            message: { type: "string" },
            error: {
              type: "object",
              properties: {
                code: { enum: Object.values(ERROR_CODES) },
                requestId: { type: "string" },
                details: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { location: { type: "string" }, field: { type: "string" }, message: { type: "string" } }
                  }
                }
              }
            }
          }
        }
      }
    },
    paths
  };
};

/* Swagger UI page for the generated document */
export const docsPage = specUrl => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>School API docs</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css"></head>
<body><div id="ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js" crossorigin></script>
<script>window.ui = SwaggerUIBundle({ url: ${JSON.stringify(specUrl)}, dom_id: "#ui", persistAuthorization: true });</script>
</body></html>`;

export const DOCS_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data: https://unpkg.com; connect-src 'self'";
