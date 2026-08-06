/**
 * Host globals used by this package.
 *
 * The library is platform-neutral: `tsconfig.json` compiles `src/` against
 * pure ECMAScript (`lib: ["ES2023"]`), with neither DOM nor Node globals.
 * `structuredClone` is a host global available in all supported runtimes
 * (browsers and Node >= 17), so declare it here rather than pulling in a
 * whole platform's globals.
 */
declare function structuredClone<T>(value: T, options?: { transfer?: unknown[] }): T;
