/** The sign hyperfield 𝕊 = {+, 0, −}, the image of ℝ under `x ↦ sign(x)`.

This is the hyperring the "toy example" clients want on their action vertices.
It carries two operations that track what real arithmetic does through the sign
map, and the split between them is the whole point of it being a *hyper*ring:

- **Multiplication `∘`** ([`multiply`]) is single-valued. `sign(x·y)` is fully
  determined by `sign(x)` and `sign(y)`. Categorically this is composition of
  influences along a causal path.
- **Addition `⊕`** ([`hyperAdd`]) is *set-valued*. `sign(x+y)` is not determined
  by the summand signs — `+ ⊕ − = {+, 0, −}` because magnitudes were thrown away.
  Categorically this is the symmetric-monoidal merge of a list of influences at a
  fan-in, and it lands in the powerset precisely because merging isn't functorial.

See `polarity_propagation.tsx` for how these propagate over a causal hypergraph. */

/** An element of the sign hyperfield. */
export type Sign = "+" | "0" | "-";

/** The three signs, in display order. */
export const SIGNS: readonly Sign[] = ["+", "0", "-"];

/** Multiplication `∘`: the sign monoid. Single-valued.

`+ ∘ + = +`, `+ ∘ − = −`, `− ∘ − = +`, and `0` annihilates. */
export function multiply(a: Sign, b: Sign): Sign {
    if (a === "0" || b === "0") {
        return "0";
    }
    return a === b ? "+" : "-";
}

/** Hyper-addition `⊕` on single signs: set-valued.

`x ⊕ 0 = {x}` (0 is the additive identity), `+ ⊕ + = {+}`, `− ⊕ − = {−}`, and the
conflicting case `+ ⊕ − = {+, 0, −}` is fully undetermined — the load-bearing
set-valued entry. */
export function hyperAdd(a: Sign, b: Sign): Set<Sign> {
    if (a === "0") {
        return new Set([b]);
    }
    if (b === "0") {
        return new Set([a]);
    }
    if (a === b) {
        return new Set([a]);
    }
    return new Set(SIGNS);
}

/** The additive identity `{0}`, as a set (the neutral element for [`addSets`]). */
export const ZERO_SET: ReadonlySet<Sign> = new Set<Sign>(["0"]);

/** Scalar action of an edge sign on a set of source polarities: `{ s ∘ x : x ∈ xs }`.

This is `∘` lifted pointwise — an edge (the scalar) acting on the induced polarity
of its source action (the module element). */
export function scaleSet(s: Sign, xs: ReadonlySet<Sign>): Set<Sign> {
    const out = new Set<Sign>();
    for (const x of xs) {
        out.add(multiply(s, x));
    }
    return out;
}

/** Hyper-sum of two sets: `⋃_{a ∈ A, b ∈ B} (a ⊕ b)`.

`⊕` lifted to the powerset. With [`ZERO_SET`] as identity, folding this over a
family of contributions computes the induced polarity at a fan-in. */
export function addSets(a: ReadonlySet<Sign>, b: ReadonlySet<Sign>): Set<Sign> {
    const out = new Set<Sign>();
    for (const x of a) {
        for (const y of b) {
            for (const r of hyperAdd(x, y)) {
                out.add(r);
            }
        }
    }
    return out;
}

/** Whether two sign sets are equal (used for fixpoint convergence). */
export function signSetEq(a: ReadonlySet<Sign>, b: ReadonlySet<Sign>): boolean {
    if (a.size !== b.size) {
        return false;
    }
    for (const x of a) {
        if (!b.has(x)) {
            return false;
        }
    }
    return true;
}

/** Display glyph for a sign (a true minus sign for `-`). */
export function signGlyph(s: Sign): string {
    return s === "-" ? "−" : s;
}

/** Render a sign set for display, e.g. `+`, `{−, 0, +}`, or `∅`. */
export function signSetToString(xs: ReadonlySet<Sign>): string {
    if (xs.size === 0) {
        return "∅";
    }
    const ordered = SIGNS.filter((s) => xs.has(s)).map(signGlyph);
    return xs.size === 1 ? ordered[0]! : `{${ordered.join(", ")}}`;
}
