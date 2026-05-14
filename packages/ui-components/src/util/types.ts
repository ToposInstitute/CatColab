/** Assertion at the type-level.

Call this function as no effect. The minimal version of:

<https://github.com/garronej/tsafe/blob/main/src/assert.ts>
 */
// oxlint-disable-next-line typescript-eslint/no-unnecessary-type-parameters -- compile-time assertion helper
export function assertTypelevel<_T extends true>() {}
