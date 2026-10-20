/* Summarises the access log: traffic, error rates and latency percentiles per route, the
   slowest routes, where the database time goes, and the most frequent error codes.

     node scripts/access-report.js                          # today's file in ACCESS_LOG_DIR
     node scripts/access-report.js logs/access-2026-10-19.log logs/access-2026-10-20.log
     node scripts/access-report.js logs --sort p95 --top 15 # every file in a folder
     docker compose logs api | node scripts/access-report.js -   # ACCESS_LOG=stdout

   Options: --sort count|p95|errors|db (default count), --top N (default 25),
   --tenant <id>, --since <minutes ago>. Lines that are not access-log lines are skipped. */
import { createReadStream, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    sort: { type: "string", default: "count" },
    top: { type: "string", default: "25" },
    tenant: { type: "string" },
    since: { type: "string" }
  }
});

const defaultFile = () =>
  join(process.env.ACCESS_LOG_DIR ?? "./logs", `access-${new Date().toISOString().slice(0, 10)}.log`);
const inputs = (positionals.length ? positionals : [defaultFile()]).flatMap(path =>
  path !== "-" && statSync(path).isDirectory()
    ? readdirSync(path)
        .filter(name => /^access-.*\.log$/.test(name))
        .sort()
        .map(name => join(path, name))
    : [path]
);
const since = args.since ? Date.now() - Number(args.since) * 60_000 : null;

const lines = async function* () {
  for (const input of inputs) {
    yield* createInterface({ input: input === "-" ? process.stdin : createReadStream(input), crlfDelay: Infinity });
  }
};

const routes = new Map();
const errorCodes = new Map();
const all = { durations: [], status4xx: 0, status5xx: 0, aborted: 0, slow: 0, first: Infinity, last: 0 };

for await (const line of lines()) {
  /* Log platforms and `docker compose logs` prefix lines ("api-1  | {…}") */
  const start = line.indexOf("{");
  if (start < 0) continue;
  let entry;
  try {
    entry = JSON.parse(line.slice(start));
  } catch {
    continue;
  }
  if (entry.log !== "access") continue;
  const time = Date.parse(entry.time);
  if (since && time < since) continue;
  if (args.tenant && entry.tenantId !== args.tenant) continue;

  /* Without a route template: app-level paths (/health, /files/…) by path, misses together */
  const key = `${entry.method} ${entry.route ?? (entry.status < 400 ? entry.path : "(unmatched)")}`;
  let route = routes.get(key);
  if (!route) routes.set(key, (route = { key, durations: [], status4xx: 0, status5xx: 0, dbMs: 0, bytes: 0 }));
  route.durations.push(entry.durationMs);
  route.dbMs += (entry.db?.postgres?.ms ?? 0) + (entry.db?.mongo?.ms ?? 0);
  route.bytes += entry.responseBytes ?? 0;
  all.durations.push(entry.durationMs);
  all.first = Math.min(all.first, time);
  all.last = Math.max(all.last, time);
  const failed = entry.status >= 500 ? "status5xx" : entry.status >= 400 ? "status4xx" : null;
  if (failed) {
    route[failed] += 1;
    all[failed] += 1;
  }
  if (entry.outcome === "aborted") all.aborted += 1;
  if (entry.slow) all.slow += 1;
  if (entry.errorCode) errorCodes.set(entry.errorCode, (errorCodes.get(entry.errorCode) ?? 0) + 1);
}

if (!all.durations.length) {
  console.log(`No access-log lines in ${inputs.join(", ")}`);
  process.exit(0);
}

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
const ms = value => `${value < 10 ? value.toFixed(1) : Math.round(value)} ms`;
const pct = (part, whole) => `${((100 * part) / whole).toFixed(1)}%`;

const total = all.durations.length;
const sortedAll = all.durations.sort((a, b) => a - b);
const seconds = Math.max(1, (all.last - all.first) / 1000);
console.log(`\nAccess log: ${new Date(all.first).toISOString()} to ${new Date(all.last).toISOString()}`);
console.log(
  `${total} requests (${(total / seconds).toFixed(2)}/s) | 4xx ${pct(all.status4xx, total)} | 5xx ${pct(all.status5xx, total)}` +
    ` | aborted ${all.aborted} | slow ${all.slow}`
);
console.log(
  `latency p50 ${ms(percentile(sortedAll, 50))} | p95 ${ms(percentile(sortedAll, 95))} | p99 ${ms(percentile(sortedAll, 99))}` +
    ` | max ${ms(sortedAll.at(-1))}\n`
);

const rows = [...routes.values()].map(route => {
  const sorted = route.durations.sort((a, b) => a - b);
  const count = sorted.length;
  return {
    route: route.key,
    count,
    "4xx": pct(route.status4xx, count),
    "5xx": pct(route.status5xx, count),
    p50: ms(percentile(sorted, 50)),
    p95: ms(percentile(sorted, 95)),
    p99: ms(percentile(sorted, 99)),
    max: ms(sorted.at(-1)),
    "avg db": ms(route.dbMs / count),
    "avg KB": (route.bytes / count / 1024).toFixed(1),
    _p95: percentile(sorted, 95),
    _errors: route.status4xx + route.status5xx,
    _db: route.dbMs / count
  };
});
const order = { count: r => r.count, p95: r => r._p95, errors: r => r._errors, db: r => r._db }[args.sort];
if (!order) throw new Error(`--sort must be count, p95, errors or db (got "${args.sort}")`);
const shown = rows.sort((a, b) => order(b) - order(a)).slice(0, Number(args.top));
console.table(shown.map(({ _p95, _errors, _db, ...row }) => row));

if (errorCodes.size) {
  console.log("\nError codes");
  console.table(
    Object.fromEntries([...errorCodes].sort((a, b) => b[1] - a[1]).map(([code, count]) => [code, { count }]))
  );
}
