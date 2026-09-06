/**
 * Fixture benchmark proving the harness end-to-end before the real
 * micro (U2) and end-to-end (U3) modules land.
 */
export default {
  name: "fixture",
  register(bench) {
    bench.add("noop", () => {});
  }
};
