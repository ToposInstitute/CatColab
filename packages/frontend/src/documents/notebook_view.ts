import type { DocHandle } from "@automerge/automerge-repo";
import { createMemo, getOwner, onCleanup, untrack, type Accessor } from "solid-js";

import type { Document, Ob } from "catcolab-document-types";
import {
    cellMatchesFilter,
    decodeEquationSide,
    findMorphismType,
    findObjectType,
    type DeepReadonly,
    type ModelDocument,
    type MorphismCell,
    type MorphismType,
    type Notebook,
    type NotebookCell,
    type ObjectCell,
    type ObjectType,
    type Shape,
} from "catcolab-documents";
import { createAutomergeDocumentView, createDocumentView } from "./reactivity";

/** Reactive reads, with commands/validation owned by the original bound notebook.
 * Cell wrappers accept the same patches as core cells. Keep document data read-only. */
export interface NotebookView<S extends Shape, H, V> {
    readonly commands: Notebook<S, ModelDocument, H, V>;
    readonly document: DeepReadonly<ModelDocument>;
    readonly title: string;
    cells(): readonly NotebookCell<S>[];
    cell(id: string): NotebookCell<S> | undefined;
    cellsOf(filter: Parameters<Notebook<S>["cellsOf"]>[0]): readonly NotebookCell<S>[];
}

/** Patch-backed Automerge implementation. Replacement releases the previous view,
 * but never disposes a caller-owned bound notebook. */
export function createAutomergeNotebookView<S extends Shape, H, V>(
    source: Accessor<Notebook<S, ModelDocument, H, V>>,
    handle: (notebook: Notebook<S, ModelDocument, H, V>) => DocHandle<Document>,
): Accessor<NotebookView<S, H, V>> {
    requireOwner();
    return createMemo(() => {
        const notebook = source();
        const document = createAutomergeDocumentView(() => handle(notebook));
        return createNotebookReadView(notebook, () => {
            const current = document();
            if (current.type !== "model") {
                throw new Error("Notebook views require a model document.");
            }
            return current;
        });
    });
}

/** Non-Automerge fallback: clones/reconciles snapshot data on every source change.
 * Rendering remains field-grained, but updating the view is not patch-backed. */
export function createReconciledNotebookView<S extends Shape, H, V>(
    source: Accessor<Notebook<S, ModelDocument, H, V>>,
): Accessor<NotebookView<S, H, V>> {
    requireOwner();
    return createMemo(() => {
        const notebook = source();
        const view = createDocumentView(notebook, () => notebook.dump());
        return createNotebookReadView(notebook, () => view);
    });
}

function requireOwner() {
    if (!getOwner()) {
        throw new Error("Notebook views must be created within a Solid owner.");
    }
}

function createNotebookReadView<S extends Shape, H, V>(
    notebook: Notebook<S, ModelDocument, H, V>,
    document: Accessor<ModelDocument>,
): NotebookView<S, H, V> {
    let active = true;
    type Entry = {
        kind: NotebookCell<S>["kind"];
        type?: ObjectType | MorphismType;
        view: NotebookCell<S>;
    };
    let cache = new Map<string, Entry>();
    const coreByView = new WeakMap<object, NotebookCell<S>>();
    onCleanup(() => {
        active = false;
        cache.clear();
    });

    function descriptor(id: string) {
        const cell = document().notebook.cellContents[id];
        if (!cell) {
            return undefined;
        }
        if (cell.tag === "rich-text") {
            return { kind: "rich-text" as const };
        }
        const judgment = cell.content;
        switch (judgment.tag) {
            case "object":
                return {
                    kind: "object" as const,
                    type: findObjectType(notebook.shape, judgment.obType),
                };
            case "morphism":
                return {
                    kind: "morphism" as const,
                    type: findMorphismType(notebook.shape, judgment.morType),
                };
            case "equation":
                return { kind: "path-equation" as const };
            default:
                throw new Error(`Formal cell ${id} is not supported by the notebook view.`);
        }
    }

    function wrap(core: NotebookCell<S>, description: ReturnType<typeof descriptor>): Entry {
        if (!description) {
            throw new Error(`Cell ${core.id} disappeared.`);
        }
        const entry: Entry = { ...description, view: core };
        function stored() {
            cells();
            const current = descriptor(core.id);
            if (
                !active ||
                cache.get(core.id) !== entry ||
                current?.kind !== entry.kind ||
                current.type !== entry.type
            ) {
                return undefined;
            }
            return document().notebook.cellContents[core.id];
        }
        function translateSide(value: unknown): unknown {
            if (Array.isArray(value)) {
                return value.map(translateSide);
            }
            return value && typeof value === "object" ? (coreByView.get(value) ?? value) : value;
        }
        const view = new Proxy(core, {
            get(target, property) {
                switch (property) {
                    case "label": {
                        const cell = stored();
                        return cell?.tag === "formal" ? cell.content.name : undefined;
                    }
                    case "content": {
                        const cell = stored();
                        return cell?.tag === "rich-text" ? cell.content : undefined;
                    }
                    case "from":
                    case "to": {
                        const cell = stored();
                        if (cell?.tag !== "formal" || cell.content.tag !== "morphism") {
                            return undefined;
                        }
                        return objectFromOb(
                            property === "from" ? cell.content.dom : cell.content.cod,
                        );
                    }
                    case "lhs":
                    case "rhs": {
                        const cell = stored();
                        const side =
                            cell?.tag === "formal" && cell.content.tag === "equation"
                                ? cell.content[property]
                                : null;
                        return decodeEquationSide<S>(side, objectFromOb, morphismFromId);
                    }
                    case "update":
                        return (patch: Record<string, unknown>) =>
                            untrack(() => {
                                if (!stored()) {
                                    return;
                                }
                                const translated = Object.fromEntries(
                                    Object.entries(patch).map(([key, value]) => [
                                        key,
                                        ["from", "to", "lhs", "rhs"].includes(key)
                                            ? translateSide(value)
                                            : value,
                                    ]),
                                );
                                // Each discriminant's patch is delegated unchanged except for view references.
                                const update = target.update;
                                update(translated);
                            });
                    case "delete":
                        return () =>
                            untrack(() => {
                                if (stored()) {
                                    target.delete();
                                }
                            });
                    default:
                        return Reflect.get(target, property);
                }
            },
        });
        entry.view = view;
        coreByView.set(view, core);
        return entry;
    }

    // Only order, kind and type participate here: label/value edits do not rebuild lists.
    const cells = createMemo(() => {
        const descriptions = document().notebook.cellOrder.map(
            (id) => [id, descriptor(id)] as const,
        );
        const cores = untrack(() => notebook.cells());
        const next = new Map<string, Entry>();
        const result = descriptions.map(([id, description], index) => {
            const previous = cache.get(id);
            const entry =
                previous &&
                previous.kind === description?.kind &&
                previous.type === description?.type
                    ? previous
                    : wrap(cores[index]!, description);
            next.set(id, entry);
            return entry.view;
        });
        cache = next;
        return result;
    });

    function reference(id: string, kind: "object" | "morphism") {
        // Track membership and IDs, not other cells' labels or endpoint values.
        for (const cell of cells()) {
            if (cell.kind !== kind) {
                continue;
            }
            const stored = document().notebook.cellContents[cell.id];
            if (stored?.tag === "formal" && stored.content.id === id) {
                return cell;
            }
        }
        return null;
    }
    function objectFromOb(ob: Ob | null) {
        return ob?.tag === "Basic"
            ? (reference(ob.content, "object") as ObjectCell<
                  NonNullable<S["objects"]>[number]
              > | null)
            : null;
    }
    function morphismFromId(id: string) {
        return reference(id, "morphism") as MorphismCell<
            S,
            NonNullable<S["morphisms"]>[number]
        > | null;
    }

    return {
        commands: notebook,
        get document() {
            return document();
        },
        get title() {
            return document().name;
        },
        cells,
        cell(id) {
            cells();
            return cache.get(id)?.view;
        },
        cellsOf(filter) {
            return cells().filter((cell) => cellMatchesFilter(cell, filter));
        },
    };
}
