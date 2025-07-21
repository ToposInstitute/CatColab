import { getReorderDestinationIndex } from "@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
    dropTargetForElements,
    monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import type { DragLocationHistory } from "@atlaskit/pragmatic-drag-and-drop/types";
import type { DocHandle, Prop } from "@automerge/automerge-repo";
import { type KbdKey, createShortcut } from "@solid-primitives/keyboard";
import ListPlus from "lucide-solid/icons/list-plus";
import {
    type Component,
    For,
    Match,
    Show,
    Switch,
    createEffect,
    createSignal,
    onCleanup,
} from "solid-js";

import type { Cell, Notebook } from "catlog-wasm";
import { type Completion, IconButton } from "../components";
import {
    type CellActions,
    type FormalCellEditorProps,
    NotebookCell,
    RichTextCellEditor,
    StemCellEditor,
    isCellDragData,
} from "./notebook_cell";
import { type FormalCell, newRichTextCell, newStemCell } from "./types";

import "./notebook_editor.css";

/** Constructor for a cell in a notebook.

A notebook knows how to edit cells, but without cell constructors, it wouldn't
know how to create them!
 */
export type CellConstructor<T> = {
    /** Name of cell constructor, usually naming the cell type. */
    name: string;

    /** Tooltip-length description of cell constructor. */
    description?: string;

    /** Keyboard shortcut to invoke the constructor. */
    shortcut?: KbdKey[];

    /** Called to construct a new cell. */
    construct: () => Cell<T>;
};

/** Notebook editor based on Automerge.

A notebook has two types of cells:

1. Rich text cells, with state managed by Automerge and ProseMirror
   independently of Solid's own state management
2. Formal content cells, with state inside a Solid Store connected to Automerge

Rich text cells are the same in all notebooks, whereas formal cells are handled
by custom components supplied to the notebook.
 */
export function NotebookEditor<T>(props: {
    handle: DocHandle<unknown>;
    path: Prop[];
    notebook: Notebook<T>;
    changeNotebook: (f: (nb: Notebook<T>) => void) => void;

    formalCellEditor: Component<FormalCellEditorProps<T>>;
    cellConstructors?: CellConstructor<T>[];
    cellLabel?: (content: T) => string | undefined;

    /** Called to duplicate an existing cell.

    If omitted, a deep copy is performed.
     */
    duplicateCell?: (content: T) => T;

    // FIXME: Remove this option once we fix focus management.
    noShortcuts?: boolean;
}) {
    let notebookRef!: HTMLDivElement;

    const [activeCell, setActiveCell] = createSignal(props.notebook.cellOrder.length > 0 ? 0 : -1);
    const [currentDropTarget, setCurrentDropTarget] = createSignal<string | null>(null);
    const [tether, setTether] = createSignal<DragLocationHistory | null>(null);

    // Set up commands and their keyboard shortcuts.
    const addAfterActiveCell = (cell: Cell<T>) => {
        props.changeNotebook((nb) => {
            const i = Math.min(activeCell() + 1, nb.cellOrder.length);
            nb.cellOrder.splice(i, 0, cell.id);
            nb.cellContents[cell.id] = cell;
            setActiveCell(i);
        });
    };

    const addOrReplaceActiveCell = (cell: Cell<T>) => {
        const cellId = props.notebook.cellOrder[activeCell()];
        const c = !cellId ? null : props.notebook.cellContents[cellId];
        if (c) {
            if (c.tag === "formal" || c.tag === "rich-text") {
                addAfterActiveCell(cell);
            } else if (c.tag === "stem") {
                replaceCellWith(activeCell(), cell);
            }
        } else {
            addAfterActiveCell(cell);
        }
    };

    const appendCell = (cell: Cell<T>) => {
        props.changeNotebook((nb) => {
            nb.cellOrder.push(cell.id);
            nb.cellContents[cell.id] = cell;
            setActiveCell(nb.cellOrder.length - 1);
        });
    };

    const insertCommands = (): Completion[] =>
        cellConstructors().map((cc) => {
            const { name, description, shortcut } = cc;
            return {
                name,
                description,
                shortcut,
                onComplete: () => addOrReplaceActiveCell(cc.construct()),
            };
        });

    const replaceCellWith = (i: number, cell: Cell<T>) => {
        props.changeNotebook((nb) => {
            const oldId = nb.cellOrder[i];

            nb.cellOrder[i] = cell.id;
            nb.cellContents[cell.id] = cell;

            if (oldId) {
                delete nb.cellContents[oldId];
            }
        });
    };

    const cellConstructors = (): CellConstructor<T>[] => [
        {
            name: "Text",
            description: "Start writing text",
            shortcut: [cellShortcutModifier, "T"],
            construct: () => newRichTextCell(),
        },
        ...(props.cellConstructors ?? []),
    ];

    const replaceCommands = (i: number): Completion[] =>
        cellConstructors().map((cc) => {
            const { name, description, shortcut } = cc;
            return {
                name,
                description,
                shortcut,
                onComplete: () => replaceCellWith(i, cc.construct()),
            };
        });

    createEffect(() => {
        if (props.noShortcuts) {
            return;
        }
        for (const command of insertCommands()) {
            if (command.shortcut) {
                createShortcut(command.shortcut, () => command.onComplete?.());
            }
        }
        createShortcut(["Shift", "Enter"], () => addAfterActiveCell(newStemCell()));
    });

    // Set up drag and drop of notebook cells. Rather than have each cell's
    // `onDragEnter` and `onDragLeave` callbacks compete (causing jittering),
    // each cell reports whether it is the valid drop target to the notebook
    // state. The `onDragLeave` callback is reserved solely for the notebook; if
    // a cell is not a valid target but the notebook is, the drop target will
    // store the last valid cell in the `tether` signal which be used as a
    // default in the case where the dragging goes above the cell list.
    createEffect(() => {
        const cleanup = combine(
            monitorForElements({
                canMonitor({ source }) {
                    return (
                        isCellDragData(source.data) &&
                        props.notebook.cellOrder.some((cellId) => cellId === source.data.cellId)
                    );
                },
                onDrop({ location, source }) {
                    const target =
                        location.current.dropTargets[0] ?? tether()?.previous?.dropTargets[0];
                    if (!(target && isCellDragData(source.data) && isCellDragData(target.data))) {
                        setTether(null);
                        setCurrentDropTarget(null);
                        return;
                    }
                    const [sourceId, targetId] = [source.data.cellId, target.data.cellId];
                    const nb = props.notebook;
                    const sourceIndex = nb.cellOrder.findIndex((cellId) => cellId === sourceId);
                    const targetIndex = nb.cellOrder.findIndex((cellId) => cellId === targetId);
                    if (sourceIndex < 0 || targetIndex < 0) {
                        return;
                    }
                    const finalIndex = getReorderDestinationIndex({
                        startIndex: sourceIndex,
                        indexOfTarget: targetIndex,
                        closestEdgeOfTarget: sourceIndex < targetIndex ? "bottom" : "top",
                        axis: "vertical",
                    });
                    props.changeNotebook((nb) => {
                        const [cellId] = nb.cellOrder.splice(sourceIndex, 1);
                        // biome-ignore lint/style/noNonNullAssertion:
                        nb.cellOrder.splice(finalIndex, 0, cellId!);
                    });
                    setTether(null);
                    setCurrentDropTarget(null);
                },
            }),
            dropTargetForElements({
                element: notebookRef,
                canDrop({ source }) {
                    return isCellDragData(source.data);
                },
                onDragLeave({ location }) {
                    setTether(location);
                },
            }),
        );
        onCleanup(cleanup);
    });

    return (
        <div class="notebook" ref={notebookRef}>
            <Show when={props.notebook.cellOrder.length === 0}>
                <div class="notebook-empty placeholder">
                    <IconButton onClick={() => appendCell(newStemCell())}>
                        <ListPlus />
                    </IconButton>
                    <span>Click button or press Shift-Enter to create a cell</span>
                </div>
            </Show>
            <ul class="notebook-cells">
                <For each={props.notebook.cellOrder}>
                    {(cellId, i) => {
                        const cell = props.notebook.cellContents[cellId];
                        if (!cell) {
                            throw `Failed to find contents for cell ${cellId}`;
                        }

                        const isActive = () => activeCell() === i();
                        const cellActions: CellActions = {
                            activateAbove() {
                                i() > 0 && setActiveCell(i() - 1);
                            },
                            activateBelow() {
                                const n = props.notebook.cellOrder.length;
                                i() < n - 1 && setActiveCell(i() + 1);
                            },
                            createAbove() {
                                props.changeNotebook((nb) => {
                                    const newCell = newStemCell();
                                    nb.cellOrder.splice(i(), 0, newCell.id);
                                    nb.cellContents[newCell.id] = newCell;
                                    setActiveCell(i());
                                });
                            },
                            createBelow() {
                                props.changeNotebook((nb) => {
                                    const newCell = newStemCell();
                                    nb.cellOrder.splice(i() + 1, 0, newCell.id);
                                    nb.cellContents[newCell.id] = newCell;
                                    setActiveCell(i() + 1);
                                });
                            },
                            deleteBackward() {
                                props.changeNotebook((nb) => {
                                    const cellId = nb.cellOrder[i()];
                                    // biome-ignore lint/style/noNonNullAssertion:
                                    delete nb.cellContents[cellId!];
                                    nb.cellOrder.splice(i(), 1);
                                    setActiveCell(i() - 1);
                                });
                            },
                            deleteForward() {
                                props.changeNotebook((nb) => {
                                    const cellId = nb.cellOrder[i()];
                                    // biome-ignore lint/style/noNonNullAssertion:
                                    delete nb.cellContents[cellId!];
                                    nb.cellOrder.splice(i(), 1);
                                    setActiveCell(i());
                                });
                            },
                            moveUp() {
                                props.changeNotebook((nb) => {
                                    if (i() > 0) {
                                        const [cellIdToMoveUp] = nb.cellOrder.splice(i(), 1);
                                        // biome-ignore lint/style/noNonNullAssertion:
                                        nb.cellOrder.splice(i() - 1, 0, cellIdToMoveUp!);
                                    }
                                });
                            },
                            moveDown() {
                                props.changeNotebook((nb) => {
                                    if (i() < nb.cellOrder.length - 1) {
                                        const [cellIdToMoveDown] = nb.cellOrder.splice(i(), 1);
                                        // biome-ignore lint/style/noNonNullAssertion:
                                        nb.cellOrder.splice(i() + 1, 0, cellIdToMoveDown!);
                                    }
                                });
                            },
                            hasFocused() {
                                setActiveCell(i());
                            },
                        };

                        return (
                            <li>
                                <NotebookCell
                                    cellId={cell.id}
                                    index={i()}
                                    actions={cellActions}
                                    tag={
                                        cell.tag === "formal"
                                            ? props.cellLabel?.(cell.content)
                                            : undefined
                                    }
                                    currentDropTarget={currentDropTarget()}
                                    setCurrentDropTarget={setCurrentDropTarget}
                                >
                                    <Switch>
                                        <Match when={cell.tag === "rich-text"}>
                                            <RichTextCellEditor
                                                cellId={cell.id}
                                                handle={props.handle}
                                                path={[
                                                    ...props.path,
                                                    "cellContents",
                                                    // biome-ignore lint/style/noNonNullAssertion:
                                                    props.notebook.cellOrder[i()]!,
                                                ]}
                                                isActive={isActive()}
                                                actions={cellActions}
                                            />
                                        </Match>
                                        <Match when={cell.tag === "formal"}>
                                            <props.formalCellEditor
                                                content={(cell as FormalCell<T>).content}
                                                changeContent={(f) => {
                                                    props.changeNotebook((nb) => {
                                                        const cell = nb.cellContents[
                                                            // biome-ignore lint/style/noNonNullAssertion:
                                                            nb.cellOrder[i()]!
                                                        ] as FormalCell<T>;

                                                        f(cell.content);
                                                    });
                                                }}
                                                isActive={isActive()}
                                                actions={cellActions}
                                            />
                                        </Match>
                                        <Match when={cell.tag === "stem"}>
                                            <StemCellEditor
                                                completions={replaceCommands(i())}
                                                isActive={isActive()}
                                                actions={cellActions}
                                            />
                                        </Match>
                                    </Switch>
                                </NotebookCell>
                            </li>
                        );
                    }}
                </For>
            </ul>
            <Show
                when={props.notebook.cellOrder.some(
                    (cellId) => props.notebook.cellContents[cellId]?.tag !== "stem",
                )}
            >
                <div class="placeholder">
                    <IconButton
                        onClick={() => appendCell(newStemCell())}
                        tooltip="Create a new cell"
                    >
                        <ListPlus />
                    </IconButton>
                </div>
            </Show>
        </div>
    );
}

/** Modifier key to use in keyboard shortcuts for cell constructors.

The choice is platform-specific: On Mac, the Alt/Option key remaps keys, so we
use Control, whereas on other platforms Control tends to be already bound in
other shortcuts, so we Alt.
 */
export const cellShortcutModifier: KbdKey = navigator.userAgent.includes("Mac") ? "Control" : "Alt";
