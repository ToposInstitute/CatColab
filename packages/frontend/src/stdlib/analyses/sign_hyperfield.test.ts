// @vitest-environment node
import { describe, expect, test } from "vitest";

import { inducedPolarities, type SignedEdge } from "./polarity_propagation_core";
import { addSets, hyperAdd, multiply, type Sign } from "./sign_hyperfield";

const set = (...xs: Sign[]) => new Set(xs);
const sorted = (xs: ReadonlySet<Sign>) => [...xs].toSorted();

describe("sign hyperfield", () => {
    test("multiplication is the single-valued sign monoid", () => {
        expect(multiply("+", "+")).toBe("+");
        expect(multiply("+", "-")).toBe("-");
        expect(multiply("-", "-")).toBe("+");
        expect(multiply("0", "+")).toBe("0");
        expect(multiply("-", "0")).toBe("0");
    });

    test("hyper-addition is set-valued, undetermined only on conflict", () => {
        expect(sorted(hyperAdd("+", "+"))).toEqual(["+"]);
        expect(sorted(hyperAdd("-", "-"))).toEqual(["-"]);
        // 0 is the additive identity.
        expect(sorted(hyperAdd("0", "+"))).toEqual(["+"]);
        expect(sorted(hyperAdd("-", "0"))).toEqual(["-"]);
        // The load-bearing entry: conflicting signs are fully undetermined.
        expect(sorted(hyperAdd("+", "-"))).toEqual(["+", "-", "0"].toSorted());
    });

    test("addSets lifts hyper-addition to the powerset", () => {
        expect(sorted(addSets(set("+"), set("-")))).toEqual(["+", "-", "0"].toSorted());
        expect(sorted(addSets(set("+"), set("+")))).toEqual(["+"]);
    });
});

// A1..A6 with causal edges a:A1->A3, b:A2->A4, c:A2->A5, d:A3->A5,
// e:A4->A6, f:A5->A6. A5 and A6 are fan-in (merge) points.
const TOY_ACTIONS = ["A1", "A2", "A3", "A4", "A5", "A6"];
const toyEdges = (signs: Partial<Record<string, Sign>>): SignedEdge[] =>
    [
        { name: "a", src: "A1", tgt: "A3" },
        { name: "b", src: "A2", tgt: "A4" },
        { name: "c", src: "A2", tgt: "A5" },
        { name: "d", src: "A3", tgt: "A5" },
        { name: "e", src: "A4", tgt: "A6" },
        { name: "f", src: "A5", tgt: "A6" },
    ].map(({ name, src, tgt }) => ({ src, tgt, sign: signs[name] ?? "+" }));

describe("polarity propagation on the toy example", () => {
    const actions = TOY_ACTIONS;
    const edges = toyEdges;

    test("all-positive edges give every action +", () => {
        const induced = inducedPolarities(actions, edges({}));
        for (const a of actions) {
            expect(sorted(induced.get(a)!)).toEqual(["+"]);
        }
    });

    test("conflicting inputs at A5 make it (and A6) set-valued", () => {
        // c excitatory (+), d inhibitory (−): A5's fan-in is undetermined.
        const induced = inducedPolarities(actions, edges({ d: "-" }));
        expect(sorted(induced.get("A5")!)).toEqual(["+", "-", "0"].toSorted());
        // The ambiguity propagates through f into A6 (which also merges e:+).
        expect(sorted(induced.get("A6")!)).toEqual(["+", "-", "0"].toSorted());
        // A3 (single + input from source A1) stays determined.
        expect(sorted(induced.get("A3")!)).toEqual(["+"]);
    });

    test("a source's seed sets (and propagates from) its polarity", () => {
        // Default: A1 is a source, seeded +. Override it to −.
        const induced = inducedPolarities(actions, toyEdges({}), { A1: "-" });
        expect(sorted(induced.get("A1")!)).toEqual(["-"]);
        // A3 = a:+ ∘ A1:− = −.
        expect(sorted(induced.get("A3")!)).toEqual(["-"]);
        // A2 (the other source) keeps its default +.
        expect(sorted(induced.get("A2")!)).toEqual(["+"]);
    });

    test("an internal action's seed injects an exogenous contribution", () => {
        // A5's default seed is 0 (transparent). Seed it − and it hyper-adds to
        // the all-+ incoming influences: {+} ⊕ {−} = {+, 0, −}.
        const induced = inducedPolarities(actions, toyEdges({}), { A5: "-" });
        expect(sorted(induced.get("A5")!)).toEqual(["+", "-", "0"].toSorted());
    });

    test("composition along a path multiplies signs (no spurious ambiguity)", () => {
        // A1 --a:−--> A3 --d:−--> A5 (single input each): (−)∘(−) = +.
        const induced = inducedPolarities(
            ["A1", "A3", "A5"],
            [
                { src: "A1", tgt: "A3", sign: "-" },
                { src: "A3", tgt: "A5", sign: "-" },
            ],
        );
        expect(sorted(induced.get("A5")!)).toEqual(["+"]);
    });
});
