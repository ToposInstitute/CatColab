import type { RichTextContent } from "catcolab-document-types";
import type { DeepReadonly } from "../document-store";
import type { NotebookDocument } from "../notebook-document";
import { isRecord } from "../parsed-document";
import {
    findMorphismType,
    findObjectType,
    type MorphismTypesOf,
    type ObjectTypesOf,
    type Shape,
} from "../shape";
import type { CellOf, MorphismCell, ObjectCell } from "./cell";
import { decodeEquationSide } from "./equation-translate";
import type { ParsedModelCell, ParsedModelDocument, ParsedModelJudgment } from "./parsed-document";
import { findModelReferenceCellId } from "./parsed-source";

/** Structural identity of a supported model cell; value fields are not read. */
export type ModelCellDescription<S extends Shape = Shape> =
    | { kind: "rich-text"; type: undefined }
    | { kind: "object"; type: ObjectTypesOf<S> }
    | { kind: "morphism"; type: MorphismTypesOf<S> }
    | { kind: "path-equation"; type: undefined };

export function describeModelCell<S extends Shape>(
    shape: S,
    document: ParsedModelDocument,
    id: string,
): ModelCellDescription<S> | undefined {
    const cell = document.notebook.cellContents[id];
    if (!cell) {
        return undefined;
    }
    if (cell.tag === "rich-text") {
        return { kind: "rich-text" as const, type: undefined };
    }
    switch (cell.content.tag) {
        case "object": {
            const type = findObjectType(shape, cell.content["obType"]);
            if (!type) {
                return undefined;
            }
            return { kind: "object" as const, type };
        }
        case "morphism": {
            const type = findMorphismType(shape, cell.content["morType"]);
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

type CellReadDocument =
    | ParsedModelDocument
    | DeepReadonly<Exclude<NotebookDocument, { type: "model" }>>;

type CellCommands<C extends CellOf<Shape>> = Omit<
    C,
    "label" | "content" | "from" | "to" | "lhs" | "rhs"
>;

/** Framework-neutral cell reads over structurally parsed model documents (or
 * non-model rich-text documents). Commands accept references by cell ID, so a
 * caller can supply its own identity-preserving resolver without translating patches.
 * An undefined read source retires the view: empty reads and no-op commands. */
export function createCellReadView<C extends CellOf<Shape>>(
    commands: CellCommands<C>,
    read: () => CellReadDocument | undefined,
    resolve: (id: string) => CellOf<Shape> | undefined = () => undefined,
    runCommand: (command: () => void) => void = (command) => command(),
): C {
    function stored(): DeepReadonly<ParsedModelCell> | undefined {
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
    function judgment(): DeepReadonly<ParsedModelJudgment> | undefined {
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
        const cellId = findModelReferenceCellId(document.notebook, kind, id);
        const resolved = cellId === undefined ? undefined : resolve(cellId);
        return resolved?.kind === kind ? resolved : null;
    }
    const objectFromOb = (ob: unknown): ObjectCell<ObjectTypesOf<Shape>> | null =>
        isRecord(ob) && ob["tag"] === "Basic" && typeof ob["content"] === "string"
            ? (reference(ob["content"], "object") as ObjectCell<ObjectTypesOf<Shape>> | null)
            : null;
    const morphismFromId = (id: string): MorphismCell<Shape, MorphismTypesOf<Shape>> | null =>
        reference(id, "morphism") as MorphismCell<Shape, MorphismTypesOf<Shape>> | null;
    function equationSide(side: "lhs" | "rhs") {
        const decl = judgment();
        return decodeEquationSide(
            decl?.tag === "equation" ? decl[side] : null,
            objectFromOb,
            morphismFromId,
        );
    }
    function runIfPresent(command: () => void): void {
        runCommand(() => {
            if (stored()) {
                command();
            }
        });
    }
    const actions = {
        id: commands.id,
        ...("type" in commands ? { type: commands.type } : {}),
        update(patch: Parameters<C["update"]>[0]): void {
            runIfPresent(() => commands.update(patch));
        },
        delete(): void {
            runIfPresent(() => commands.delete());
        },
    };

    // Only spread actions: spreading getters would capture stale values.
    switch (commands.kind) {
        case "rich-text":
            return {
                ...actions,
                kind: "rich-text",
                get content() {
                    const cell = stored();
                    const content = cell?.tag === "rich-text" ? cell.content : undefined;
                    // Rich-text spans are opaque here, just as they are at the editor boundary.
                    return typeof content === "string" || Array.isArray(content)
                        ? (content as RichTextContent)
                        : undefined;
                },
            } as C;
        case "object":
            return {
                ...actions,
                kind: "object",
                get label() {
                    return judgment()?.name;
                },
            } as C;
        case "morphism":
            return {
                ...actions,
                kind: "morphism",
                get label() {
                    return judgment()?.name;
                },
                get from() {
                    const decl = judgment();
                    return decl?.tag === "morphism" ? objectFromOb(decl["dom"]) : undefined;
                },
                get to() {
                    const decl = judgment();
                    return decl?.tag === "morphism" ? objectFromOb(decl["cod"]) : undefined;
                },
            } as C;
        case "path-equation":
            return {
                ...actions,
                kind: "path-equation",
                get label() {
                    return judgment()?.name;
                },
                get lhs() {
                    return equationSide("lhs");
                },
                get rhs() {
                    return equationSide("rhs");
                },
            } as C;
    }
}
