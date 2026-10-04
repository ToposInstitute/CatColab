import { assert, describe, test } from "vitest";

import { type Completion, getSeparatedIndices } from "catcolab-ui-components";
import type { Theory } from "../theory";
import { modelCellConstructors } from "./model_editor";

describe("modelCellConstructors", () => {
    test("marks first theory-specific constructor with separatorBefore when model types exist", () => {
        const mockTheory = {
            modelTypes: [
                {
                    tag: "ObType",
                    name: "Object",
                    description: "An object",
                    shortcut: ["O"],
                    obType: 0,
                },
                {
                    tag: "MorType",
                    name: "Morphism",
                    description: "A morphism",
                    shortcut: ["M"],
                    morType: 0,
                },
            ],
            equationCellMeta: {
                name: "Equation",
                description: "An equation",
                shortcut: ["E"],
            },
        } as unknown as Theory;

        const constructors = modelCellConstructors(mockTheory);

        // General constructors: Instantiate
        assert.strictEqual(constructors[0]?.name, "Instantiate");
        assert.strictEqual(constructors[0]?.separatorBefore, undefined);

        // First theory constructor: Object
        assert.strictEqual(constructors[1]?.name, "Object");
        assert.strictEqual(constructors[1]?.separatorBefore, true);

        // Subsequent theory constructors
        assert.strictEqual(constructors[2]?.name, "Morphism");
        assert.strictEqual(constructors[2]?.separatorBefore, undefined);

        assert.strictEqual(constructors[3]?.name, "Equation");
        assert.strictEqual(constructors[3]?.separatorBefore, undefined);

        assert.strictEqual(constructors.length, 4);
    });

    test("marks Equation with separatorBefore when there are 0 modelTypes but equationCellMeta exists", () => {
        const mockTheory = {
            modelTypes: [],
            equationCellMeta: {
                name: "Equation",
                description: "An equation",
                shortcut: ["E"],
            },
        } as unknown as Theory;

        const constructors = modelCellConstructors(mockTheory);

        assert.strictEqual(constructors.length, 2);
        assert.strictEqual(constructors[0]?.name, "Instantiate");
        assert.strictEqual(constructors[0]?.separatorBefore, undefined);

        assert.strictEqual(constructors[1]?.name, "Equation");
        assert.strictEqual(constructors[1]?.separatorBefore, true);
    });

    test("does not set separatorBefore when there are no theory-specific constructors", () => {
        const mockTheory = {
            modelTypes: [],
            equationCellMeta: undefined,
        } as unknown as Theory;

        const constructors = modelCellConstructors(mockTheory);

        assert.strictEqual(constructors.length, 1);
        assert.strictEqual(constructors[0]?.name, "Instantiate");
        assert.strictEqual(constructors[0]?.separatorBefore, undefined);
    });
});

describe("getSeparatedIndices", () => {
    const completions: Completion[] = [
        { name: "Text" },
        { name: "Instantiate" },
        { name: "Object", separatorBefore: true },
        { name: "Morphism" },
        { name: "Equation" },
    ];

    test("Case 1 — no filtering: renders separator before boundary item", () => {
        const visible = completions;
        const separated = getSeparatedIndices(visible, completions);

        assert.deepStrictEqual(Array.from(separated), [2]);
        assert.strictEqual(visible[2]?.name, "Object");
    });

    test("Case 2 — boundary item filtered out: preserves separator before first visible theory item", () => {
        // Filter "i": "Instantiate" and "Morphism" match; "Object" is filtered out
        const visible = [completions[1]!, completions[3]!];
        assert.strictEqual(visible[0]?.name, "Instantiate");
        assert.strictEqual(visible[1]?.name, "Morphism");

        const separated = getSeparatedIndices(visible, completions);

        // Separator must be rendered before Morphism (index 1 in visible list)
        assert.deepStrictEqual(Array.from(separated), [1]);
    });

    test("Case 3 — first visible item belongs to theory group: no top separator", () => {
        // Filter "m": only "Morphism" visible
        const singleTheory = [completions[3]!];
        const separatedSingle = getSeparatedIndices(singleTheory, completions);
        assert.strictEqual(separatedSingle.size, 0);

        // Filter keeps "Morphism" and "Equation" (both theory group)
        const multipleTheory = [completions[3]!, completions[4]!];
        const separatedMultiple = getSeparatedIndices(multipleTheory, completions);
        assert.strictEqual(separatedMultiple.size, 0);
    });

    test("Case 4 — only general group visible: no separator", () => {
        // Filter keeps only "Text" and "Instantiate"
        const generalOnly = [completions[0]!, completions[1]!];
        const separated = getSeparatedIndices(generalOnly, completions);
        assert.strictEqual(separated.size, 0);
    });

    test("Case 5 — boundary item remains visible: separator remains before boundary item", () => {
        const visible = [completions[1]!, completions[2]!, completions[3]!];
        const separated = getSeparatedIndices(visible, completions);

        assert.deepStrictEqual(Array.from(separated), [1]);
        assert.strictEqual(visible[1]?.name, "Object");
    });

    test("Case 6 — navigation and selection count: separator does not add extra index", () => {
        const visible = [completions[1]!, completions[3]!];
        const separated = getSeparatedIndices(visible, completions);

        assert.strictEqual(visible.length, 2);
        assert.strictEqual(separated.has(1), true);
        // Visual separator is just a class on visible item 1, consuming 0 keyboard steps
    });

    test("Case 7 — clearing filter: restores original boundary without mutating source data", () => {
        // Step A: Filter by "i"
        const filtered = [completions[1]!, completions[3]!];
        const separatedFiltered = getSeparatedIndices(filtered, completions);
        assert.deepStrictEqual(Array.from(separatedFiltered), [1]);

        // Step B: Clear filter -> all completions visible
        const resetSeparated = getSeparatedIndices(completions, completions);
        assert.deepStrictEqual(Array.from(resetSeparated), [2]);

        // Source completions array and objects must not be mutated
        assert.strictEqual(completions[0]?.separatorBefore, undefined);
        assert.strictEqual(completions[1]?.separatorBefore, undefined);
        assert.strictEqual(completions[2]?.separatorBefore, true);
        assert.strictEqual(completions[3]?.separatorBefore, undefined);
        assert.strictEqual(completions[4]?.separatorBefore, undefined);
    });

    test("supports multiple boundaries when intermediate items are filtered", () => {
        const multiGroup: Completion[] = [
            { name: "General 1" },
            { name: "General 2" },
            { name: "Theory 1", separatorBefore: true },
            { name: "Theory 2" },
            { name: "Special 1", separatorBefore: true },
            { name: "Special 2" },
        ];

        // Filter keeps [General 2, Theory 2, Special 2] (boundary items Theory 1 and Special 1 filtered out)
        const visible = [multiGroup[1]!, multiGroup[3]!, multiGroup[5]!];
        const separated = getSeparatedIndices(visible, multiGroup);

        // Separators before Theory 2 (index 1) and Special 2 (index 2)
        assert.deepStrictEqual(Array.from(separated), [1, 2]);
    });

    test("handles filter reordering when theory item appears before general item", () => {
        // Suppose match quality sorts a startsWith theory match ahead of an includes general match
        const reordered = [completions[3]!, completions[1]!]; // Morphism (theory), Instantiate (general)
        const separated = getSeparatedIndices(reordered, completions);

        // Morphism at index 0 has no top separator; Instantiate at index 1 is general and has no separator
        assert.strictEqual(separated.size, 0);
    });

    test("returns empty set when no completions have separatorBefore", () => {
        const plain: Completion[] = [{ name: "A" }, { name: "B" }, { name: "C" }];
        assert.strictEqual(getSeparatedIndices(plain, plain).size, 0);
    });

    test("handles empty or single-item lists gracefully", () => {
        assert.strictEqual(getSeparatedIndices([], []).size, 0);
        assert.strictEqual(getSeparatedIndices([{ name: "A" }], [{ name: "A" }]).size, 0);
    });
});
