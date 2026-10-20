/* A small logic-less template language for HTML documents a school edits (certificate
   and report card formats and the like):

     {{student.name}}                        the value, HTML-escaped ("" when missing)
     {{#if student.pen}}PEN: {{student.pen}}{{else}}-{{/if}}   (nests; {{else}} optional)
     {{#each report.subjects}}<tr><td>{{name}}</td></tr>{{else}}No subjects{{/each}}

   {{#if}} counts a missing value, "", false and an empty list as absent.
   Paths are dot-separated keys of the data object. Inside {{#each}} a path is looked up
   on the list's item first, then outside it ({{school.name}} still works in a loop).
   Nothing else is evaluated, so a template can never run code on the server. */

const TOKEN = /\{\{\s*(#(?:if|each)\s+[\w.]+|else|\/if|\/each|[\w.]+)\s*\}\}/g;

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ESCAPES[char]);

const lookupIn = (data, path) =>
  path.split(".").reduce((value, key) => (value === null || value === undefined ? undefined : value[key]), data);

/* scopes: the data, then each enclosing loop's item; the innermost one that has the
   path's first key answers */
const lookup = (scopes, path) => {
  const first = path.split(".")[0];
  for (let i = scopes.length - 1; i > 0; i--) {
    const scope = scopes[i];
    if (scope !== null && typeof scope === "object" && scope[first] !== undefined) return lookupIn(scope, path);
  }
  return lookupIn(scopes[0], path);
};

/* {{#if}} is false for a missing value, "", false and an empty list */
const present = value =>
  !(value === undefined || value === null || value === "" || value === false || (Array.isArray(value) && !value.length));

/* Template -> tree of { text } | { path } | { block: "if" | "each", path, body, alt }
   nodes (alt: what follows {{else}}), or a readable error */
const parse = template => {
  const root = { body: [] };
  const stack = [root];
  const into = node => node.alt ?? node.body;
  let at = 0;
  for (const match of template.matchAll(TOKEN)) {
    const top = stack.at(-1);
    if (match.index > at) into(top).push({ text: template.slice(at, match.index) });
    at = match.index + match[0].length;
    const token = match[1];
    const opens = /^#(if|each)\s+(.+)$/.exec(token);
    if (opens) {
      const node = { block: opens[1], path: opens[2], body: [], alt: null };
      into(top).push(node);
      stack.push(node);
    } else if (token === "else") {
      if (stack.length === 1 || top.alt) throw new Error("{{else}} without a matching {{#if}} or {{#each}}");
      top.alt = [];
    } else if (token === "/if" || token === "/each") {
      const block = token.slice(1);
      if (stack.length === 1) throw new Error(`{{${token}}} without a matching {{#${block}}}`);
      if (top.block !== block) throw new Error(`{{#${top.block} ${top.path}}} is closed with {{${token}}}`);
      stack.pop();
    } else {
      into(top).push({ path: token });
    }
  }
  if (stack.length > 1) {
    const open = stack.at(-1);
    throw new Error(`{{#${open.block} ${open.path}}} is never closed with {{/${open.block}}}`);
  }
  if (at < template.length) root.body.push({ text: template.slice(at) });
  return root.body;
};

const fill = (nodes, scopes) =>
  nodes
    .map(node => {
      if (node.text !== undefined) return node.text;
      const value = lookup(scopes, node.path);
      if (!node.block) return present(value) ? escapeHtml(value) : "";
      if (node.block === "if") return fill(present(value) ? node.body : (node.alt ?? []), scopes);
      const items = Array.isArray(value) ? value : [];
      if (!items.length) return fill(node.alt ?? [], scopes);
      return items.map(item => fill(node.body, [...scopes, item])).join("");
    })
    .join("");

/* Check a template against the paths a document has: known holds "a.b" for values and
   lists, and "list[].field" for a list item's fields ("a.list[].rows[].x" when nested).
   -> { error } when it does not parse, else { unknown } (paths it uses that aren't known) */
export const checkTemplate = (template, known) => {
  let nodes;
  try {
    nodes = parse(template);
  } catch (error) {
    return { error: error.message };
  }
  const unknown = new Set();
  /* The known path a path means where it is used (innermost loop first), or null */
  const resolve = (path, loops) => {
    for (let i = loops.length - 1; i >= 0; i--) {
      if (known.has(`${loops[i]}.${path}`)) return `${loops[i]}.${path}`;
    }
    return known.has(path) ? path : null;
  };
  const walk = (list, loops) => {
    for (const node of list) {
      if (node.text !== undefined) continue;
      const resolved = resolve(node.path, loops);
      if (!resolved) unknown.add(node.path);
      if (!node.block) continue;
      walk(node.body, node.block === "each" && resolved ? [...loops, `${resolved}[]`] : loops);
      walk(node.alt ?? [], loops);
    }
  };
  walk(nodes, []);
  return { unknown: [...unknown] };
};

/* Fill a template with data (throws on a template that does not parse) */
export const renderTemplate = (template, data) => fill(parse(template), [data]);

/* A complete HTML document from a body template and a stylesheet */
export const htmlDocument = ({ body, css = "", title = "" }) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
  `<style>${css.replace(/<\/style/gi, "<\\/style")}</style></head><body>${body}</body></html>`;
