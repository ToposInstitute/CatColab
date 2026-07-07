import { addSets, scaleSet, type Sign, signSetEq, ZERO_SET } from "./sign_hyperfield";

/** A causal edge with a chosen influence sign, for sign propagation. */
export type SignedEdge = {
    /** Source action id. */
    src: string;
    /** Target action id. */
    tgt: string;
    /** Influence sign carried by the edge. */
    sign: Sign;
};

/** Compute the induced polarity of every action as a monotone fixpoint.

`induced(X) = ⊕_{e: Y→X} ( sign(e) ∘ induced(Y) )`, folded from the additive
identity `{0}`. Sources (no incoming edge) are seeded with `{+}`. Contributions
from not-yet-computed predecessors are empty and simply add nothing this round;
since the sets only grow, iterating to a fixpoint converges. This terminates on
cyclic digraphs too (the toy example is acyclic, converging in one sweep). */
export function inducedPolarities(
    actionIds: string[],
    edges: SignedEdge[],
): Map<string, Set<Sign>> {
    const incoming = new Map<string, { src: string; sign: Sign }[]>();
    for (const id of actionIds) {
        incoming.set(id, []);
    }
    for (const e of edges) {
        incoming.get(e.tgt)?.push({ src: e.src, sign: e.sign });
    }

    const induced = new Map<string, Set<Sign>>();
    for (const id of actionIds) {
        // Sources are seeded present (+); everything else starts empty.
        induced.set(id, incoming.get(id)!.length === 0 ? new Set<Sign>(["+"]) : new Set<Sign>());
    }

    let changed = true;
    let guard = 0;
    while (changed && guard++ <= actionIds.length + 1) {
        changed = false;
        for (const id of actionIds) {
            const ins = incoming.get(id)!;
            if (ins.length === 0) {
                continue; // source: fixed seed
            }
            let acc: Set<Sign> = new Set(ZERO_SET);
            for (const { src, sign } of ins) {
                const contrib = scaleSet(sign, induced.get(src)!);
                if (contrib.size > 0) {
                    acc = addSets(acc, contrib);
                }
            }
            if (!signSetEq(induced.get(id)!, acc)) {
                induced.set(id, acc);
                changed = true;
            }
        }
    }
    return induced;
}

/** CSS-class key for a node given its induced polarity set. */
export function polarityClass(set: ReadonlySet<Sign>): string {
    if (set.size === 0) {
        return "unknown";
    }
    if (set.size > 1) {
        return "ambiguous";
    }
    return signKey([...set][0]!);
}

/** CSS-safe key for a single sign (`-` is not a valid identifier tail alone). */
export function signKey(s: Sign): string {
    return s === "+" ? "pos" : s === "-" ? "neg" : "zero";
}
