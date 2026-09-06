/**
 * Harness smoke fixture: exercises module loading, selection, METRIC
 * emission, and results writing end-to-end without touching any store or
 * middleware.
 */
export default {
  name: "fixture",
  register(bench) {
    bench.add("noop", () => {});
  }
};
