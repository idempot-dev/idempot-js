import fs from "node:fs";

/**
 * Regression gate for a comparison, as a fraction of the baseline median.
 * Matches the ±15% variance discipline the full preset is validated
 * against: deltas beyond this are flagged, not failed — the compare mode
 * is informational by design.
 */
export const MEDIAN_GATE_PCT = 15;

/**
 * Refuse comparisons that would produce misleading deltas. Medians are
 * only comparable within one preset on one machine and runtime.
 * Returns a list of problems; an empty list means the comparison may
 * proceed.
 */
export function guardComparison(baseline, current) {
  const problems = [];
  if (baseline.version !== current.version) {
    problems.push(
      `baseline format version mismatch: baseline v${baseline.version} vs current v${current.version}`
    );
  }
  if (baseline.preset !== current.preset) {
    problems.push(
      `preset mismatch: baseline "${baseline.preset}" vs current "${current.preset}" — medians are only comparable within one preset.`
    );
  }
  const base = baseline.runtime;
  const curr = current.runtime;
  const sameMachine =
    base.cpu === curr.cpu &&
    base.platform === curr.platform &&
    base.arch === curr.arch &&
    base.kind === curr.kind;
  if (!sameMachine) {
    problems.push(
      `hardware/runtime mismatch: baseline ${base.kind} ${base.version} on ${base.platform}-${base.arch} (${base.cpu}) vs current ${curr.kind} ${curr.version} on ${curr.platform}-${curr.arch} (${curr.cpu}) — medians from different machines are not comparable.`
    );
  }
  return problems;
}

/**
 * Compare a current run against a baseline. Tasks and derived metrics
 * are matched by module+task / name; entries missing on either side are
 * reported as "new" or "missing" instead of guessed deltas.
 * Returns rows of
 * { kind, module, task, baseline, current, delta_pct, flagged, status }.
 */
export function compareRuns(baseline, current) {
  const taskKey = (row) => `${row.module}\u0000${row.task}`;
  const baseTasks = new Map(baseline.results.map((row) => [taskKey(row), row]));
  const currentKeys = new Set(current.results.map(taskKey));

  const rows = [];
  for (const cur of current.results) {
    const prev = baseTasks.get(taskKey(cur));
    if (!prev) {
      rows.push({
        kind: "task",
        module: cur.module,
        task: cur.task,
        status: "new"
      });
      continue;
    }
    const deltaPct =
      ((cur.metrics.median_ms - prev.metrics.median_ms) /
        prev.metrics.median_ms) *
      100;
    rows.push({
      kind: "task",
      module: cur.module,
      task: cur.task,
      baseline: prev.metrics.median_ms,
      current: cur.metrics.median_ms,
      delta_pct: deltaPct,
      flagged: Math.abs(deltaPct) > MEDIAN_GATE_PCT,
      status: "ok"
    });
  }
  for (const [key, prev] of baseTasks) {
    if (!currentKeys.has(key)) {
      rows.push({
        kind: "task",
        module: prev.module,
        task: prev.task,
        status: "missing"
      });
    }
  }

  const baseDerived = new Map(baseline.derived.map((row) => [row.name, row]));
  const currentDerived = new Set(current.derived.map((row) => row.name));
  for (const cur of current.derived) {
    const prev = baseDerived.get(cur.name);
    if (!prev) {
      rows.push({ kind: "derived", task: cur.name, status: "new" });
      continue;
    }
    // Derived overhead deltas hover near zero for cheap paths; a percent
    // delta against a ~0 baseline is meaningless noise.
    if (Math.abs(prev.value) < 1e-9) {
      rows.push({
        kind: "derived",
        module: "",
        task: cur.name,
        baseline: prev.value,
        current: cur.value,
        delta_pct: null,
        flagged: false,
        status: "ok"
      });
      continue;
    }
    const deltaPct = ((cur.value - prev.value) / prev.value) * 100;
    rows.push({
      kind: "derived",
      module: "",
      task: cur.name,
      baseline: prev.value,
      current: cur.value,
      delta_pct: deltaPct,
      flagged: Math.abs(deltaPct) > MEDIAN_GATE_PCT,
      status: "ok"
    });
  }
  for (const name of baseDerived.keys()) {
    if (!currentDerived.has(name)) {
      rows.push({ kind: "derived", task: name, status: "missing" });
    }
  }

  rows.sort((a, b) =>
    `${a.module}\u0000${a.task}`.localeCompare(`${b.module}\u0000${b.task}`)
  );
  return rows;
}

function formatNumber(value) {
  if (value === undefined) {
    return "-";
  }
  const abs = Math.abs(value);
  if (abs === 0) {
    return "0";
  }
  if (abs >= 1000) {
    return value.toFixed(0);
  }
  if (abs >= 1) {
    return value.toFixed(3);
  }
  return value.toPrecision(3);
}

/**
 * Human-readable comparison table. For tasks, lower median_ms is faster;
 * for derived overhead metrics, lower is less overhead. A negative delta
 * is an improvement in both cases.
 */
export function formatComparison(rows, { baselinePath } = {}) {
  const header =
    "module                 | task                              | baseline | current  | delta      | note";
  const line = (row) => {
    if (row.status === "new") {
      return `${(row.module ?? "").padEnd(22)} | ${row.task.padEnd(33)} | -        | -        | -          | new`;
    }
    if (row.status === "missing") {
      return `${(row.module ?? "").padEnd(22)} | ${row.task.padEnd(33)} | -        | -        | -          | not in current run`;
    }
    const note = row.flagged
      ? `beyond ±${MEDIAN_GATE_PCT}% gate`
      : row.delta_pct === null
        ? "baseline ~0"
        : row.delta_pct <= 0
          ? "faster"
          : "slower";
    const deltaCell =
      row.delta_pct === null
        ? "-"
        : `${(row.delta_pct >= 0 ? "+" : "") + row.delta_pct.toFixed(1)}%`;
    return `${(row.module ?? "").padEnd(22)} | ${row.task.padEnd(33)} | ${formatNumber(row.baseline).padStart(8)} | ${formatNumber(row.current).padStart(8)} | ${deltaCell.padStart(9)} | ${note}`;
  };
  const lines = rows.map(line);
  const headerNote = baselinePath ? `\nBaseline: ${baselinePath}\n` : "";
  return [headerNote, header, "-".repeat(header.length), ...lines].join("\n");
}

export function readBaseline(baselinePath) {
  return JSON.parse(fs.readFileSync(baselinePath, "utf8"));
}
