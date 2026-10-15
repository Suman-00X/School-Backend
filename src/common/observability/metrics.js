import { monitorEventLoopDelay } from "node:perf_hooks";

/* Minimal Prometheus metrics (text exposition format 0.0.4), no dependencies.

     const jobRuns = counter("jobs_total", "Jobs run", ["job", "outcome"]);
     jobRuns.inc({ job: "x", outcome: "completed" });

   Label values must be low-cardinality (route templates, never raw URLs or ids). */

const metrics = new Map();
const PREFIX = "school_";

const escape = value => String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
const labelText = labels => {
  const entries = Object.entries(labels);
  return entries.length ? `{${entries.map(([k, v]) => `${k}="${escape(v)}"`).join(",")}}` : "";
};
const keyOf = (labelNames, labels) => JSON.stringify(labelNames.map(name => labels[name] ?? ""));
const labelsOf = (labelNames, key) => Object.fromEntries(JSON.parse(key).map((v, i) => [labelNames[i], v]));

const register = (name, metric) => {
  const fullName = PREFIX + name;
  if (metrics.has(fullName)) return metrics.get(fullName);
  metrics.set(fullName, { name: fullName, ...metric });
  return metrics.get(fullName);
};

export const counter = (name, help, labelNames = []) => {
  const values = new Map();
  register(name, {
    help,
    type: "counter",
    lines: n => [...values].map(([key, value]) => `${n}${labelText(labelsOf(labelNames, key))} ${value}`)
  });
  return {
    inc: (labels = {}, by = 1) => {
      const key = keyOf(labelNames, labels);
      values.set(key, (values.get(key) ?? 0) + by);
    }
  };
};

export const histogram = (
  name,
  help,
  labelNames = [],
  buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
) => {
  const series = new Map();
  register(name, {
    help,
    type: "histogram",
    lines: n =>
      [...series].flatMap(([key, s]) => {
        const labels = labelsOf(labelNames, key);
        return [
          ...buckets.map((le, i) => `${n}_bucket${labelText({ ...labels, le })} ${s.counts[i]}`),
          `${n}_bucket${labelText({ ...labels, le: "+Inf" })} ${s.count}`,
          `${n}_sum${labelText(labels)} ${s.sum}`,
          `${n}_count${labelText(labels)} ${s.count}`
        ];
      })
  });
  return {
    observe: (labels, value) => {
      const key = keyOf(labelNames, labels);
      let s = series.get(key);
      if (!s) series.set(key, (s = { counts: buckets.map(() => 0), sum: 0, count: 0 }));
      buckets.forEach((le, i) => {
        if (value <= le) s.counts[i] += 1;
      });
      s.sum += value;
      s.count += 1;
    }
  };
};

/* Value read at scrape time: collect() returns a number or [{ labels, value }] */
export const gauge = (name, help, collect) =>
  register(name, {
    help,
    type: "gauge",
    lines: n => {
      const value = collect();
      if (value === undefined || value === null) return [];
      const rows = Array.isArray(value) ? value : [{ labels: {}, value }];
      return rows.map(row => `${n}${labelText(row.labels ?? {})} ${row.value}`);
    }
  });

export const renderMetrics = () =>
  `${[...metrics.values()]
    .flatMap(m => [`# HELP ${m.name} ${m.help}`, `# TYPE ${m.name} ${m.type}`, ...m.lines(m.name)])
    .join("\n")}\n`;

/* Process health, always on */
const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();
const startedAt = Date.now();
gauge("process_uptime_seconds", "Seconds since the process started", () => (Date.now() - startedAt) / 1000);
gauge("process_resident_memory_bytes", "Resident memory", () => process.memoryUsage().rss);
gauge("process_heap_used_bytes", "V8 heap in use", () => process.memoryUsage().heapUsed);
gauge("event_loop_delay_p99_seconds", "Event loop delay, 99th percentile", () => loopDelay.percentile(99) / 1e9);
