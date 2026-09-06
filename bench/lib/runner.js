import { Bench } from "tinybench";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BENCH_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RESULTS_PATH = path.join(BENCH_DIR, "results.md");

/**
 * Benchmark modules discovered from a fixed list. New benchmark files
 * (micro.*, e2e.*) are added here; each exports a default object
 * `{ name, register(bench, preset), derive?(moduleResults) }`.
 */
const MODULE_FILES = [
  "./fixture.demo.js",
  "./micro.fingerprint.js",
  "./micro.validation.js",
  "./micro.resilience.js",
  "./e2e.hono-sqlite.js"
];

export const PRESETS = {
  full: {
    repeats: 7,
    benchOptions: {
      warmupTime: 100,
      warmupIterations: 1000,
      time: 300,
      timestampProvider: "hrtimeNow"
    }
  },
  quick: {
    repeats: 1,
    benchOptions: {
      warmupTime: 10,
      warmupIterations: 20,
      time: 50,
      iterations: 1000,
      timestampProvider: "hrtimeNow"
    }
  }
};

export async function loadModules() {
  return Promise.all(
    MODULE_FILES.map(async (file) => {
      const modulePath = path.join(BENCH_DIR, path.basename(file));
      const imported = await import(modulePath);
      return imported.default;
    })
  );
}

export function validateSelection(modules, names) {
  const known = modules.map((module) => module.name);
  // A selection name matches a module by exact name or by unique substring
  // (so `fingerprint` selects `micro.fingerprint`, `e2e` selects
  // `e2e.hono-sqlite`). Ambiguous substrings are rejected.
  const resolve = (name) => {
    if (known.includes(name)) {
      return { name, matches: [name] };
    }
    return { name, matches: known.filter((k) => k.includes(name)) };
  };
  const resolved = names.map(resolve);
  const errors = [];
  for (const { name, matches } of resolved) {
    if (matches.length === 0) {
      errors.push(
        `Unknown benchmark module(s): ${name}. Available: ${known.join(", ")}.`
      );
    } else if (matches.length > 1) {
      errors.push(
        `Ambiguous benchmark selection "${name}": matches ${matches.join(", ")}.`
      );
    }
  }
  if (errors.length > 0) {
    return { ok: false, error: errors.join("\n") };
  }
  const selectedNames = resolved.flatMap(({ matches }) => matches);
  const selected =
    names.length > 0
      ? modules.filter((m) => selectedNames.includes(m.name))
      : modules;
  return { ok: true, selected };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function slug(text) {
  return String(text).trim().toLowerCase().replace(/\s+/g, "_");
}

function collectRunResults(bench, taskModule) {
  return bench.tasks.map((task) => {
    if (task.result.state === "errored") {
      const cause = task.result.error?.stack ?? String(task.result.error);
      throw new Error(`Benchmark task "${task.name}" errored: ${cause}`);
    }
    return {
      module: taskModule.get(task.name),
      task: task.name,
      throughput: task.result.throughput,
      latency: task.result.latency
    };
  });
}

function aggregate(repeats) {
  const perTask = new Map();
  for (const run of repeats) {
    for (const entry of run) {
      const key = `${entry.module}\u0000${entry.task}`;
      if (!perTask.has(key)) {
        perTask.set(key, { module: entry.module, task: entry.task, runs: [] });
      }
      perTask.get(key).runs.push(entry);
    }
  }
  return [...perTask.values()].map(({ module, task, runs }) => {
    const hzValues = runs.map((run) => run.throughput.p50);
    const hzMedian = median(hzValues);
    const result = {
      module,
      task,
      median_hz: hzMedian,
      median_ms: median(runs.map((run) => run.latency.p50)),
      rme_pct: median(runs.map((run) => run.throughput.rme))
    };
    if (runs.length > 1) {
      const spread = (Math.max(...hzValues) - Math.min(...hzValues)) / hzMedian;
      result.spread_pct = spread * 100;
    }
    return result;
  });
}

function moduleResults(results, moduleName) {
  return results.filter((row) => row.module === moduleName);
}

function metricLines(results, derived) {
  const lines = [];
  for (const row of results) {
    for (const metric of Object.keys(row).filter(
      (key) => key !== "module" && key !== "task"
    )) {
      lines.push(
        `METRIC ${slug(row.module)}.${slug(row.task)}.${metric}=${row[metric]}`
      );
    }
  }
  for (const { name, value } of derived) {
    lines.push(`METRIC ${name}=${value}`);
  }
  return lines;
}

function formatTable(results) {
  const columns = [
    "module",
    "task",
    "median_hz",
    "median_ms",
    "rme_pct",
    "spread_pct"
  ];
  const used = columns.filter((column) => results.some((row) => column in row));
  const rows = results.map((row) => {
    const cell = {};
    for (const column of used) {
      cell[column] =
        row[column] === undefined
          ? ""
          : typeof row[column] === "number"
            ? row[column].toFixed(3)
            : row[column];
    }
    return cell;
  });
  const widths = used.map((column) =>
    Math.max(column.length, ...rows.map((row) => String(row[column]).length))
  );
  const line = (cells) =>
    `| ${cells.map((cell, index) => String(cell).padEnd(widths[index])).join(" | ")} |`;
  return [
    line(used),
    line(used.map((_column, index) => "-".repeat(widths[index]))),
    ...rows.map((row) => line(used.map((column) => row[column])))
  ].join("\n");
}

function writeResultsFile({ preset, modules, results, lines }) {
  const date = new Date().toISOString();
  const table = formatTable(results);
  const modulesNote =
    modules.length === MODULE_FILES.length
      ? "all modules"
      : modules.map((module) => module.name).join(", ");
  const content = `# Benchmark results

- Run date: ${date}
- Preset: ${preset}
- Modules: ${modulesNote}
- Runtime: Node ${process.version} on ${os.platform()} ${os.release()} (${os.arch()}, ${os.cpus()[0]?.model ?? "unknown CPU"})

Numbers from a laptop are comparative, not absolute. Quick-preset numbers are noisier
by design (single pass, few iterations); treat quick-preset swings as noise, not
regressions, and validate with the full preset before acting.

${table}

## METRIC lines

\`\`\`
${lines.join("\n")}
\`\`\`
`;
  fs.writeFileSync(RESULTS_PATH, content);
}

export async function runSuite({ preset, modules }) {
  const { repeats, benchOptions } = PRESETS[preset];
  const repeatsResults = [];
  for (let index = 0; index < repeats; index++) {
    const bench = new Bench({ ...benchOptions, name: "suite" });
    const taskModule = new Map();
    for (const module of modules) {
      const before = new Set(bench.tasks.map((task) => task.name));
      module.register(bench, preset);
      for (const task of bench.tasks) {
        if (!before.has(task.name)) {
          taskModule.set(task.name, module.name);
        }
      }
    }
    await bench.run();
    repeatsResults.push(collectRunResults(bench, taskModule));
  }
  const results = aggregate(repeatsResults);
  const derived = [];
  for (const module of modules) {
    if (typeof module.derive === "function") {
      derived.push(...module.derive(moduleResults(results, module.name)));
    }
  }
  const lines = metricLines(results, derived);
  for (const line of lines) {
    console.log(line);
  }
  console.log("");
  console.log(formatTable(results));
  writeResultsFile({ preset, modules, results, lines });
  return { results, derived, lines };
}
