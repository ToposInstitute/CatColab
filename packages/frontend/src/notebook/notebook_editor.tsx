import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { getReorderDestinationIndex } from "@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index";
import type { DocHandle, Prop } from "@automerge/automerge-repo";
import { makeEventListener } from "@solid-primitives/event-listener";
import ListPlus from "lucide-solid/icons/list-plus";
import {
    type Component,
    createEffect,
    createSignal,
    For,
    Match,
    onCleanup,
    Show,
    Switch,
} from "solid-js";
import invariant from "tiny-invariant";

import {
    type Completion,
    IconButton,
    type KbdKey,
    keyEventHasModifier,
    type ModifierKey,
} from "catcolab-ui-components";
import type { Cell, MorType, Notebook, ObType } from "catlog-wasm";
import {
    type CellActions,
    type FormalCellEditorProps,
    isCellDragData,
    NotebookCell,
    RichTextCellEditor,
    StemCellEditor,
} from "./notebook_cell";
import { type FormalCell, NotebookUtils, newRichTextCell, newStemCell } from "./types";

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
    cellConstructors: (cellType?: string, cellName?: string) => CellConstructor<T>[];
    cellLabel?: (content: T) => string | undefined;

    /** Called to duplicate an existing cell.

    If omitted, a deep copy is performed.
     */
    duplicateCell?: (content: T) => T;

    // FIXME: Remove this option once we fix focus management.
    noShortcuts?: boolean;
}) {
    const [activeCell, setActiveCell] = createSignal<number | null>(null);
    const [currentDropTarget, setCurrentDropTarget] = createSignal<string | null>(null);

    // Set up commands and their keyboard shortcuts.
    const addAfterActiveCell = (cell: Cell<T>) => {
        const [i, n] = [activeCell(), props.notebook.cellOrder.length];
        const cellIndex = i != null ? Math.min(i + 1, n) : n;
        props.changeNotebook((nb) => {
            NotebookUtils.insertCellAtIndex(nb, cell, cellIndex);
        });
        setActiveCell(cellIndex);
    };

    const addOrReplaceActiveCell = (cell: Cell<T>) => {
        const cellIndex = activeCell() ?? -1;
        const existingCell =
            cellIndex >= 0 ? NotebookUtils.tryGetCellByIndex(props.notebook, cellIndex) : null;
        if (existingCell?.tag === "stem") {
            replaceCellWith(cellIndex, cell);
        } else {
            addAfterActiveCell(cell);
        }
    };

    const appendCell = (cell: Cell<T>) => {
        props.changeNotebook((nb) => {
            NotebookUtils.appendCell(nb, cell);
        });
        setActiveCell(NotebookUtils.numCells(props.notebook) - 1);
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

    const isFormalCell = (cell: Cell<T>): cell is { tag: "formal"; id: string; content: T } => {
        return cell.tag === "formal";
    };

    const isObType = (content: unknown): content is { tag: "object"; obType: ObType } => {
        return (
            typeof content === "object" &&
            content !== null &&
            "tag" in content &&
            content.tag === "object"
        );
    };

    const isMorType = (content: unknown): content is { tag: "morphism"; morType: MorType } => {
        return (
            typeof content === "object" &&
            content !== null &&
            "tag" in content &&
            content.tag === "morphism"
        );
    };

    const retypeCellAs = (i: number, newCell: Cell<T>) => {
        if (!newCell || !isFormalCell(newCell)) {
            return;
        }
        const mutator = (cellContent: T) => {
            if (isObType(cellContent) && isObType(newCell.content)) {
                cellContent.obType = newCell.content.obType;
            } else if (isMorType(cellContent) && isMorType(newCell.content)) {
                cellContent.morType = newCell.content.morType;
            }
        };
        props.changeNotebook((nb) => {
            NotebookUtils.retypeCell(nb, i, mutator);
        });
    };

    const cellConstructors = (cellType?: string, cellName?: string): CellConstructor<T>[] => [
        ...(cellType && cellName
            ? []
            : [
                  {
                      name: "Text",
                      description: "Start writing text",
                      shortcut: ["T"],
                      construct: () => newRichTextCell(),
                  },
              ]),
        ...(props.cellConstructors(cellType, cellName) ?? []),
    ];

    const replaceCommands = (i: number): Completion[] =>
        cellConstructors().map((cc) => {
            const { name, description, shortcut } = cc;
            return {
                name,
                description,
                shortcut: shortcut && [cellShortcutModifier, ...shortcut],
                onComplete: () => replaceCellWith(i, cc.construct()),
            };
        });

    const retypeCommands = (i: number, cellType?: string, cellName?: string): Completion[] =>
        cellConstructors(cellType, cellName).map((cc) => {
            const { name, description, shortcut } = cc;
            return {
                name,
                description,
                shortcut,
                onComplete: () => retypeCellAs(i, cc.construct()),
            };
        });

    makeEventListener(window, "keydown", (evt) => {
        if (props.noShortcuts) {
            return;
        }
        if (keyEventHasModifier(evt, cellShortcutModifier)) {
            for (const command of insertCommands()) {
                if (command.shortcut && evt.key.toUpperCase() === command.shortcut[0]) {
                    command.onComplete?.();
                    return evt.preventDefault();
                }
            }
        }
        if (evt.shiftKey && evt.key === "Enter") {
            addAfterActiveCell(newStemCell());
            return evt.preventDefault();
        }
    });

    // Set up drag and drop for notebook cells. Each cell reports to the
    // notebook whether it is the current drop target. Only the drop action is
    // handled here.
    createEffect(() => {
        const cleanup = monitorForElements({
            canMonitor({ source }) {
                return (
                    isCellDragData(source.data) &&
                    props.notebook.cellOrder.some((cellId) => cellId === source.data.cellId)
                );
            },
            onDrop({ location, source }) {
                const target = location.current.dropTargets[0];
                if (!(target && isCellDragData(source.data) && isCellDragData(target.data))) {
                    setCurrentDropTarget(null);
                    return;
                }
                const [sourceId, targetId] = [source.data.cellId, target.data.cellId];
                const nb = props.notebook;
                const sourceIndex = nb.cellOrder.indexOf(sourceId);
                const targetIndex = nb.cellOrder.indexOf(targetId);
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
                    NotebookUtils.moveCellByIndex(nb, sourceIndex, finalIndex);
                });
                setCurrentDropTarget(null);
            },
        });
        onCleanup(cleanup);
    });

    return (
        <div class="notebook">
            <Show when={props.notebook.cellOrder.length === 0}>
                <div class="notebook-cell-placeholder">
                    <IconButton onClick={() => appendCell(newStemCell())}>
                        <ListPlus />
                    </IconButton>
                    <span>Click button or press Shift-Enter to create a cell</span>
                </div>
            </Show>
            <ul class="notebook-cells">
                <For each={props.notebook.cellOrder}>
                    {(cellId, i) => {
                        const isActive = () => activeCell() === i();

                        const cellActions: CellActions = {
                            activateAbove() {
                                if (i() > 0) {
                                    setActiveCell(i() - 1);
                                }
                            },
                            activateBelow() {
                                if (i() < NotebookUtils.numCells(props.notebook) - 1) {
                                    setActiveCell(i() + 1);
                                }
                            },
                            createAbove() {
                                const index = i();
                                props.changeNotebook((nb) => {
                                    NotebookUtils.newStemCellAtIndex(nb, index);
                                });
                                setActiveCell(index);
                            },
                            createBelow() {
                                const index = i() + 1;
                                props.changeNotebook((nb) => {
                                    NotebookUtils.newStemCellAtIndex(nb, index);
                                });
                                setActiveCell(index);
                            },
                            deleteBackward() {
                                const index = i();
                                props.changeNotebook((nb) => {
                                    NotebookUtils.deleteCellAtIndex(nb, index);
                                });
                                setActiveCell(index - 1);
                            },
                            deleteForward() {
                                const index = i();
                                props.changeNotebook((nb) => {
                                    NotebookUtils.deleteCellAtIndex(nb, index);
                                });
                                setActiveCell(index);
                            },
                            moveUp() {
                                props.changeNotebook((nb) => {
                                    NotebookUtils.moveCellUp(nb, i());
                                });
                            },
                            moveDown() {
                                props.changeNotebook((nb) => {
                                    NotebookUtils.moveCellDown(nb, i());
                                });
                            },
                            hasFocused() {
                                setActiveCell(i());
                            },
                        };

                        const cell = props.notebook.cellContents[cellId];
                        invariant(cell, `Failed to find contents for cell '${cellId}'`);

                        const cellName = (cell: Cell<T>) =>
                            (cell.tag === "formal"
                                ? props.cellLabel?.(cell.content)
                                : undefined) as string;

                        const cellType = (cell: Cell<T>) =>
                            cell.tag === "formal"
                                ? isObType(cell.content)
                                    ? "ObType"
                                    : "MorType"
                                : undefined;

                        if (cell.tag !== "rich-text") {
                            cellActions.duplicate = () => {
                                const index = i();
                                props.changeNotebook((nb) => {
                                    NotebookUtils.duplicateCellAtIndex(
                                        nb,
                                        index,
                                        props.duplicateCell,
                                    );
                                });
                                setActiveCell(index + 1);
                            };
                        }

                        return (
                            <li>
                                <NotebookCell
                                    cellId={cell.id}
                                    index={i()}
                                    actions={cellActions}
                                    tag={cellName(cell)}
                                    currentDropTarget={currentDropTarget()}
                                    setCurrentDropTarget={setCurrentDropTarget}
                                    isActive={isActive()}
                                    replaceCommands={retypeCommands(
                                        i(),
                                        cellType(cell),
                                        cellName(cell),
                                    )}
                                >
                                    <Switch>
                                        <Match when={cell.tag === "rich-text"}>
                                            <RichTextCellEditor
                                                cellId={cell.id}
                                                handle={props.handle}
                                                path={[...props.path, "cellContents", cell.id]}
                                                isActive={isActive()}
                                                actions={cellActions}
                                            />
                                        </Match>
                                        <Match when={cell.tag === "formal"}>
                                            <props.formalCellEditor
                                                content={(cell as FormalCell<T>).content}
                                                changeContent={(f) =>
                                                    props.changeNotebook((nb) =>
                                                        NotebookUtils.mutateCellContentById(
                                                            nb,
                                                            cell.id,
                                                            f,
                                                        ),
                                                    )
                                                }
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
            <Show when={NotebookUtils.getCells(props.notebook).some((cell) => cell.tag !== "stem")}>
                <div class="notebook-cell-placeholder">
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
const cellShortcutModifier: ModifierKey = navigator.userAgent.includes("Mac") ? "Control" : "Alt";
