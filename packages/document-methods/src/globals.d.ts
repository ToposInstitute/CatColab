// Ambient declaration for the host-provided global `structuredClone`.
//
// `structuredClone` is part of the HTML Living Standard and available in all
// modern JavaScript runtimes (browsers, Node ≥17, Deno, Bun, Web Workers), but
// its TypeScript declaration only ships with the `"DOM"` and `"WebWorker"`
// libs. Declaring it locally keeps this package runtime-agnostic at the type
// level.
declare function structuredClone<T>(value: T, options?: { transfer?: unknown[] }): T;
