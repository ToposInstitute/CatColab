import { assert, describe, test } from "vitest";

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

    test.sequential("types bound for models should exist in theory", async () => {
        for (const meta of theories.allMetadata()) {
            const theory = await theories.get(meta.id);
            for (const meta of theory.modelTypes) {
                if (meta.tag === "MorType") {
                    assert(theory.theory.hasMorType(meta.morType));
                } else {
                    assert(theory.theory.hasObType(meta.obType));
                }
            }
        }
    });

    test.sequential("types bound for instances should exist in theory", async () => {
        for (const meta of theories.allMetadata()) {
            const theory = await theories.get(meta.id);
            for (const meta of theory.instanceTypes) {
                if (meta.tag === "MorType") {
                    assert(theory.theory.hasMorType(meta.morType));
                } else {
                    assert(theory.theory.hasObType(meta.obType));
                }
            }
        }
    });
});
