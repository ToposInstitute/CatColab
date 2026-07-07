import { addSets, scaleSet, type Sign, signSetEq } from "./sign_hyperfield";

/** A causal edge with a chosen influence sign, for sign propagation. */
export type SignedEdge = {
    /** Source action id. */
    src: string;
    /** Target action id. */
    tgt: string;
    /** Influence sign carried by the edge. */
    sign: Sign;
};

/** The default seed polarity of an action given whether it is a source.

Source actions (no incoming causal edge) default to `+` (present); internal
actions default to `0`, the additive identity, so their seed is transparent and
their polarity is computed purely from incoming influences unless overridden. */
export function defaultSeed(isSource: boolean): Sign {
    return isSource ? "+" : "0";
}

/** Compute the induced polarity of every action as a monotone fixpoint.

`induced(X) = seed(X) ⊕ ⊕_{e: Y→X} ( sign(e) ∘ induced(Y) )`. Each action's own
seed is the baseline of the hyper-sum (see [`defaultSeed`] for the default when a
seed is not given in `seeds`), so a source's polarity *is* its seed, and an
internal action's seed injects an exogenous contribution alongside its incoming
influences. Contributions from not-yet-computed predecessors are empty and add
nothing this round; iterating to a fixpoint converges (the toy example is acyclic,
converging in one sweep). */
export function inducedPolarities(
    actionIds: string[],
    edges: SignedEdge[],
    seeds: Record<string, Sign> = {},
): Map<string, Set<Sign>> {
    const incoming = new Map<string, { src: string; sign: Sign }[]>();
    for (const id of actionIds) {
        incoming.set(id, []);
    }
    for (const e of edges) {
        incoming.get(e.tgt)?.push({ src: e.src, sign: e.sign });
    }

    const seedOf = (id: string): Sign => seeds[id] ?? defaultSeed(incoming.get(id)!.length === 0);

    const induced = new Map<string, Set<Sign>>();
    for (const id of actionIds) {
        // Sources take their seed immediately; internal actions start empty and
        // fill in as their predecessors are computed.
        induced.set(id, incoming.get(id)!.length === 0 ? new Set<Sign>([seedOf(id)]) : new Set());
    }

    let changed = true;
    let guard = 0;
    while (changed && guard++ <= actionIds.length + 1) {
        changed = false;
        for (const id of actionIds) {
            const ins = incoming.get(id)!;
            if (ins.length === 0) {
                continue; // source: polarity is exactly its seed
            }
            // Fold from the seed as baseline (0 is the additive identity, so a
            // default 0 seed is transparent).
            let acc: Set<Sign> = new Set<Sign>([seedOf(id)]);
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
