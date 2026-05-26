/**
 * Strip ANSI escape sequences from a string. Covers CSI (Control Sequence
 * Introducer), OSC (Operating System Command), and a handful of other common
 * escape forms emitted by terminal-aware programs.
 *
 * Borrowed from the chalk/ansi-regex pattern.
 */

const PATTERN = [
    "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d/#&.:=?%@~_]*)*)?\\u0007)",
    "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))",
].join("|");

const ANSI_RE = new RegExp(PATTERN, "g");

/** @param {string} s */
export function stripAnsi(s) {
    return String(s).replace(ANSI_RE, "");
}
