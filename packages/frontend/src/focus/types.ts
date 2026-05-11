/** Algebraic data types for focus targets and matchers.
 *
 * A `FocusTarget` is the concrete value stored in `FocusContext`: it identifies
 * which notebook (if any) currently has focus. Cell-level focus is intentionally
 * out of scope here: notebooks track their own active cell locally. The focus
 * context only needs to know which notebook is focused so that shortcut
 * bindings can be scoped to it.
 *
 * `FocusMatcher` is what shortcut bindings declare via their `when` field; the
 * dispatcher uses `matcherMatches` and `matcherSpecificity` to pick the right
 * binding.
 */

import { match } from "ts-pattern";

/** Focus on a notebook. */
export type NotebookFocus = {
    kind: "notebook";
    /** Stable identifier for this notebook (e.g. a document ref ID, or a
     * locally generated unique id when no doc ref is available). */
    id: string;
};

/** A concrete focusable element. Currently only notebooks are focusable. */
export type FocusTarget = NotebookFocus;

/** Constructors for `FocusTarget`. */
export const focusTarget = {
    notebook: (id: string): NotebookFocus => ({ kind: "notebook", id }),
};

/** Structural equality for `FocusTarget`. */
export function focusTargetEquals(a: FocusTarget, b: FocusTarget): boolean {
    return a.id === b.id;
}

/** A short, log-friendly string for a focus target. */
export function focusTargetToString(t: FocusTarget | null): string {
    return match(t)
        .with(null, () => "(none)")
        .with({ kind: "notebook" }, ({ id }) => `notebook(${id})`)
        .exhaustive();
}

/** Predicate determining which focus targets a shortcut binding matches.
 *
 * Closed ADT so the dispatcher can compute specificity without consumers
 * having to assign numeric weights themselves.
 */
export type FocusMatcher =
    /** Always matches; truly global binding. */
    | { kind: "global" }
    /** Matches focus on the given notebook. */
    | { kind: "notebook"; id: string };

/** Constructors for `FocusMatcher`. */
export const focusMatch = {
    global: (): FocusMatcher => ({ kind: "global" }),
    notebook: (n: NotebookFocus): FocusMatcher => ({ kind: "notebook", id: n.id }),
};

/** Does the matcher accept the current focus target? */
export function matcherMatches(m: FocusMatcher, t: FocusTarget | null): boolean {
    return match(m)
        .with({ kind: "global" }, () => true)
        .with({ kind: "notebook" }, ({ id }) => t !== null && t.id === id)
        .exhaustive();
}

/** Specificity score for conflict resolution (higher = more specific).
 *
 * Bindings whose matcher has the highest specificity among matching ones win;
 * ties are broken by registration order.
 */
export function matcherSpecificity(m: FocusMatcher): number {
    return match(m)
        .with({ kind: "global" }, () => 0)
        .with({ kind: "notebook" }, () => 1)
        .exhaustive();
}
