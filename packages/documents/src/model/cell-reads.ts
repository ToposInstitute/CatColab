import type { ModelJudgment, NotebookCell, Ob } from "catcolab-document-types";
import type { DeepReadonly } from "../document-store";
import type { NotebookDocument } from "../notebook-document";
import {
    findMorphismType,
    findObjectType,
    type MorphismTypesOf,
    type ObjectTypesOf,
    type Shape,
} from "../shape";
import type { CellOf, MorphismCell, ObjectCell } from "./cell";
import type { ModelDocument } from "./document";
import { decodeEquationSide } from "./equation-translate";

/** Structural identity of a supported model cell; value fields are not read. */
export type ModelCellDescription =
    | { kind: "rich-text"; type: undefined }
    | { kind: "object"; type: ObjectTypesOf<Shape> }
    | { kind: "morphism"; type: MorphismTypesOf<Shape> }
    | { kind: "path-equation"; type: undefined };

export function describeModelCell(
    shape: Shape,
    document: DeepReadonly<ModelDocument>,
    id: string,
): ModelCellDescription | undefined {
    const cell = document.notebook.cellContents[id];
    if (!cell) {
        return undefined;
    }
    if (cell.tag === "rich-text") {
        return { kind: "rich-text" as const, type: undefined };
    }
    switch (cell.content.tag) {
        case "object": {
            const type = findObjectType(shape, cell.content.obType);
            if (!type) {
                return undefined;
            }
            return { kind: "object" as const, type };
        }
        case "morphism": {
            const type = findMorphismType(shape, cell.content.morType);
            if (!type) {
                return undefined;
            }
            return { kind: "morphism" as const, type };
        }
        case "equation":
            return { kind: "path-equation" as const, type: undefined };
        default:
            return undefined;
    }
}

/** Framework-neutral cell reads. Commands accept references by cell ID, so a
 * caller can supply its own identity-preserving resolver without translating patches.
 * An undefined read source retires the view: empty reads and no-op commands. */
export function createCellReadView<C extends CellOf<Shape>>(
    commands: Omit<C, "label" | "content" | "from" | "to" | "lhs" | "rhs">,
    read: () => DeepReadonly<NotebookDocument> | undefined,
    resolve: (id: string) => CellOf<Shape> | undefined = () => undefined,
    runCommand: (command: () => void) => void = (command) => command(),
): C {
    function stored(): DeepReadonly<NotebookCell<ModelJudgment>> | undefined {
        const document = read();
        if (!document) {
            return undefined;
        }
        if (commands.kind === "rich-text") {
            const cell = document.notebook.cellContents[commands.id];
            if (!cell) {
                return undefined;
            }
            if (cell.tag !== "rich-text") {
                throw new Error(`Cell ${commands.id} is not rich text.`);
            }
            return cell;
        }
        if (document.type !== "model") {
            throw new Error("Formal model reads require a model document.");
        }
        const cell = document.notebook.cellContents[commands.id];
        if (!cell) {
            return undefined;
        }
        const kind =
            cell.tag === "rich-text"
                ? "rich-text"
                : cell.content.tag === "equation"
                  ? "path-equation"
                  : cell.content.tag;
        if (kind !== commands.kind) {
            throw new Error(`Cell ${commands.id} is not ${commands.kind}.`);
        }
        return cell;
    }
    function judgment(): DeepReadonly<ModelJudgment> | undefined {
        const cell = stored();
        return cell?.tag === "formal" ? cell.content : undefined;
    }
    function reference(
        id: string,
        kind: "object" | "morphism",
    ): ObjectCell<ObjectTypesOf<Shape>> | MorphismCell<Shape, MorphismTypesOf<Shape>> | null {
        const document = read();
        if (document?.type !== "model") {
            return null;
        }
        for (const cellId of document.notebook.cellOrder) {
            const cell = document.notebook.cellContents[cellId];
            if (cell?.tag === "formal" && cell.content.tag === kind && cell.content.id === id) {
                const resolved = resolve(cellId);
                return resolved?.kind === kind ? resolved : null;
            }
        }
        return null;
    }
    const objectFromOb = (
        ob: DeepReadonly<Ob> | null,
    ): ObjectCell<NonNullable<Shape["objects"]>[number]> | null =>
        ob?.tag === "Basic"
            ? (reference(ob.content, "object") as ObjectCell<
                  NonNullable<Shape["objects"]>[number]
              > | null)
            : null;
    const morphismFromId = (
        id: string,
    ): MorphismCell<Shape, NonNullable<Shape["morphisms"]>[number]> | null =>
        reference(id, "morphism") as MorphismCell<
            Shape,
            NonNullable<Shape["morphisms"]>[number]
        > | null;
    const reads =
        commands.kind === "rich-text"
            ? {
                  get content() {
                      const cell = stored();
                      return cell?.tag === "rich-text" ? cell.content : undefined;
                  },
              }
            : {
                  get label() {
                      return judgment()?.name;
                  },
              };
    // Copy getter descriptors, not values. Spreading a read object would evaluate it.
    const properties = Object.getOwnPropertyDescriptors(reads);
    if (commands.kind === "morphism") {
        for (const [name, field] of [
            ["from", "dom"],
            ["to", "cod"],
        ] as const) {
            properties[name] = {
                enumerable: true,
                get() {
                    const decl = judgment();
                    return decl?.tag === "morphism" ? objectFromOb(decl[field]) : undefined;
                },
            };
        }
    }
    if (commands.kind === "path-equation") {
        for (const name of ["lhs", "rhs"] as const) {
            properties[name] = {
                enumerable: true,
                get() {
                    const decl = judgment();
                    return decodeEquationSide(
                        decl?.tag === "equation" ? decl[name] : null,
                        objectFromOb,
                        morphismFromId,
                    );
                },
            };
        }
    }
    return Object.defineProperties(
        {
            kind: commands.kind,
            id: commands.id,
            ...("type" in commands ? { type: commands.type } : {}),
            update(patch: Parameters<C["update"]>[0]): void {
                runCommand(() => {
                    if (read()) {
                        commands.update(patch);
                    }
                });
            },
            delete(): void {
                runCommand(() => {
                    if (read()) {
                        commands.delete();
                    }
                });
            },
        },
        properties,
    ) as C;
}
