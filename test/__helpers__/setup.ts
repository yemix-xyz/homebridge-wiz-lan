// Preloaded by bunfig.toml. Quiets noisy console output during tests so a
// failing assertion message isn't lost in a flood of logs from production
// code paths that defensively log. Individual tests can still assert against
// calls on the injected `wiz.log` mock — they don't go through console.
const noop = () => {};
console.debug = noop;
console.info = noop;
