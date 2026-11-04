import { expect } from "vitest";

import type { Notebook, ModelDocument, Shape, Result } from "catcolab-documents";
import type { DblModel, DblTheory } from "catlog-wasm";

export function expectOk<T, E>(result: Result<T, E>): T {
    expect(result.tag).toBe("Ok");
    if (result.tag !== "Ok") {
        throw new Error("Expected an Ok result");
    }
    return result.content;
}

export async function migrateCoreModel(
    notebook: Notebook<Shape, ModelDocument>,
    target: Shape & { getCoreTheory: () => Promise<DblTheory> },
    migrate: (model: DblModel, theory: DblTheory) => DblModel,
) {
    const { DblModelMap, elaborateModel } = await import("catlog-wasm");
    const sourceTheory = await notebook.shape.getCoreTheory!();
    const targetTheory = await target.getCoreTheory();
    const models = new DblModelMap();
    const model = elaborateModel(notebook.dump().notebook, models, sourceTheory, "test");
    try {
        const migrated = migrate(model, targetTheory);
        try {
            expect(migrated.validate().tag).toBe("Ok");
            return migrated.presentation();
        } finally {
            migrated.free();
        }
    } finally {
        model.free();
        models.free();
        sourceTheory.free();
        targetTheory.free();
    }
}
