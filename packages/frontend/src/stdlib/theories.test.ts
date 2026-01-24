import { assert, describe, expect, test } from "vitest";

import { stdTheories } from "./theories.ts";

describe("Standard library of theories", () => {
    const theories = stdTheories;

    test("should have a nonempty list of theories", () => {
        assert(Array.from(theories.allMetadata()).length > 0);
    });

    test("should have an extant default theory", () => {
        const meta = theories.defaultTheoryMetadata();
        assert(meta.isDefault);
        assert(theories.has(meta.id));
    });

    test.sequential("should have dynamically loadable theories", async () => {
        for (const meta of theories.allMetadata()) {
            await theories.get(meta.id);
        }
    });

    test.sequential("should have valid references to migratable theories", async () => {
        for (const meta of theories.allMetadata()) {
            const theory = await theories.get(meta.id);
            assert(theory.inclusions.every((id) => theories.has(id)));
            assert(theory.migrationTargets.every((id) => theories.has(id)));
        }
    });

    test.sequential("mor and ob types in modelTypes should exist in WASM theory", async () => {
        for (const meta of theories.allMetadata()) {
            const theory = await theories.get(meta.id);
            for (const mt of theory.modelTypes) {
                if (mt.tag === "MorType") {
                    expect(() => theory.theory.src(mt.morType)).not.toThrow();
                } else {
                    // ObType
                    expect(() =>
                        theory.theory.src({
                            tag: "Hom",
                            content: mt.obType,
                        }),
                    ).not.toThrow();
                }
            }
        }
    });

    test.sequential("mor and ob types in instanceTypes should exist in WASM theory", async () => {
        for (const meta of theories.allMetadata()) {
            const theory = await theories.get(meta.id);
            for (const mt of theory.instanceTypes) {
                if (mt.tag === "MorType") {
                    expect(() => theory.theory.src(mt.morType)).not.toThrow();
                } else {
                    expect(() =>
                        theory.theory.src({
                            tag: "Hom",
                            content: mt.obType,
                        }),
                    ).not.toThrow();
                }
            }
        }
    });
});
