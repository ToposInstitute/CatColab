import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { getReorderDestinationIndex } from "@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
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
import { type Completion, IconButton } from "../components";
import { deepCopyJSON } from "../util/deepcopy";
import {
    type CellActions,
    type FormalCellEditorProps,
    NotebookCell,
    RichTextCellEditor,
    StemCellEditor,
    isCellDragData,
} from "./notebook_cell";
import { type Cell, type FormalCell, type Notebook, newRichTextCell, newStemCell } from "./types";

import "./notebook_editor.css";

import { v7 as uuidv7 } from 'uuid'; // for cell duplication and id generation

/** Constructor of a cell in a notebook.

A notebook knows how to edit cells, but without cell constructors, it wouldn't
know how to create them!
 */
export type CellConstructor<T> = {
    // Name of cell constructor, usually naming the cell type.
    name: string;

    // Tooltip-length description of cell constructor.
    description?: string;

    // Keyboard shortcut to invoke the constructor.
    shortcut?: KbdKey[];

    // Function to construct the cell.
    construct: () => Cell<T>;
    
    // for duplication functionality 
    duplicate?: (cell: Cell<T>) => Cell<T>;
    
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
    cellConstructors: CellConstructor<T>[];
    cellLabel?: (content: T) => string | undefined;
    // FIXME: Remove this option once we fix focus management.
    noShortcuts?: boolean;
}) {
    const [activeCell, setActiveCell] = createSignal(props.notebook.cells.length > 0 ? 0 : -1);

    // Set up commands and their keyboard shortcuts.


    // Adds a new cell after the currently active cell
    const addAfterActiveCell = (cell: Cell<T>) => {
        props.changeNotebook((nb) => {
            nb.cells.splice(activeCell() + 1, 0, cell);
            setActiveCell(activeCell() + 1);
        });
    };

    // Adds a new cell or replaces the active cell based on its type
    const addOrReplaceActiveCell = (cell: Cell<T>) => {
        const c = props.notebook.cells[activeCell()];
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

    // Appends a new cell to the end of the notebook
    const appendCell = (cell: Cell<T>) => {
        props.changeNotebook((nb) => {
            nb.cells.push(cell);
            setActiveCell(nb.cells.length - 1);
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

    // Replaces the cell at index 'i' with a new cell
    const replaceCellWith = (i: number, cell: Cell<T>) => {
        props.changeNotebook((nb) => {
            nb.cells[i] = cell;
        });
    };

    const cellConstructors = (): CellConstructor<T>[] => [
        {
            name: "Text",
            description: "Start writing text",
            shortcut: [cellShortcutModifier, "T"],
            construct: () => newRichTextCell(),
        },
        ...props.cellConstructors,
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

    // Set up drag and drop of notebook cells.
    createEffect(() => {
        const cleanup = monitorForElements({
            canMonitor({ source }) {
                return (
                    isCellDragData(source.data) &&
                    props.notebook.cells.some((cell) => cell.id === source.data.cellId)
                );
            },
            onDrop({ location, source }) {
                const target = location.current.dropTargets[0];
                if (!(target && isCellDragData(source.data) && isCellDragData(target.data))) {
                    return;
                }
                const [sourceId, targetId] = [source.data.cellId, target.data.cellId];
                const nb = props.notebook;
                const sourceIndex = nb.cells.findIndex((cell) => cell.id === sourceId);
                const targetIndex = nb.cells.findIndex((cell) => cell.id === targetId);
                if (sourceIndex < 0 || targetIndex < 0) {
                    return;
                }
                const finalIndex = getReorderDestinationIndex({
                    startIndex: sourceIndex,
                    indexOfTarget: targetIndex,
                    closestEdgeOfTarget: extractClosestEdge(target.data),
                    axis: "vertical",
                });
                props.changeNotebook((nb) => {
                    const [cell] = nb.cells.splice(sourceIndex, 1);
                    nb.cells.splice(finalIndex, 0, deepCopyJSON(cell));
                });
            },
        });
        onCleanup(cleanup);
    });

    return (
        <div class="notebook">
            <Show when={props.notebook.cells.length === 0}>
                <div class="notebook-empty placeholder">
                    <IconButton onClick={() => appendCell(newStemCell())}>
                        <ListPlus />
                    </IconButton>
                    <span>Click button or press Shift-Enter to create a cell</span>
                </div>
            </Show>
            <ul class="notebook-cells">
                <For each={props.notebook.cells}>
                    {(cell, i) => {
                        const isActive = () => activeCell() === i();
                        const cellActions: CellActions = {
                            activateAbove: () => {
                                i() > 0 && setActiveCell(i() - 1);
                            },
                            // activates the cell below the current one
                            activateBelow: () => {
                                const n = props.notebook.cells.length;
                                i() < n - 1 && setActiveCell(i() + 1);
                            },
                            // creates a new cell above the current one 
                            createAbove: () =>
                                props.changeNotebook((nb) => {
                                    nb.cells.splice(i(), 0, newStemCell());
                                    setActiveCell(i());
                                }),
                            // creates a new cell below the current one 
                            createBelow: () =>
                                props.changeNotebook((nb) => {
                                    nb.cells.splice(i() + 1, 0, newStemCell());
                                    setActiveCell(i() + 1);
                                }),
                            // deletes the cell behind the current (selected) one, once it is deleted, the cell behind the selected one is activated
                            deleteBackward: () =>
                                props.changeNotebook((nb) => {
                                    nb.cells.splice(i(), 1);
                                    setActiveCell(i() - 1);
                                }),
                            // deletes the cell in front of the current cell, it then keeps the current cell active
                            deleteForward: () =>
                                props.changeNotebook((nb) => {
                                    nb.cells.splice(i(), 1);
                                    setActiveCell(i());
                                }),
                            // activates current cell
                            hasFocused: () => {
                                setActiveCell(i());
                            },

                            duplicateCell: () => {
                                props.changeNotebook((nb) => {
                                    const currentCell = nb.cells[i()];
                                    const newCell = deepCopyJSON(currentCell);
                                    newCell.id = uuidv7(); // Generate a new UUID for the duplicated cell
                                    nb.cells.splice(i() + 1, 0, deepCopyJSON(nb.cells[i()])); // Insert a deep copy of the cell below
                                    setActiveCell(i() + 1); // Sets the active cell to the new position
                                });
                            },
                            // moving cell up 
                            moveCellUp: () => {
                                if (props.notebook.cells.length > 0 && i() > 0) {
                                    props.changeNotebook((nb) => {
                                        const cellToMoveUp = nb.cells[i()]; // declaring the cell to be moved
                                        nb.cells.splice(i(), 1); // Remove the original cell
                                        nb.cells.splice(i() - 1, 0, cellToMoveUp); // Insert the cell above
                                    });
                                    setActiveCell(i() - 1); // Set the active cell to the new position
                                }
                            },
                            // moving cell down 
                            moveCellDown: () => {
                                if (props.notebook.cells.length > 0 && i() < props.notebook.cells.length - 1) {
                                    props.changeNotebook((nb) => {
                                        const cellToMoveDown = nb.cells[i()]; // Declare the cell to be moved
                                        nb.cells.splice(i(), 1); // Remove the original cell
                                        nb.cells.splice(i() + 1, 0, cellToMoveDown); // Insert the cell below its original position
                                    });
                                    setActiveCell(i() + 1); // Set the active cell to the new position
                                }
                            },
                            //// hamidah's additions (end)
                        };


                        return (
                            <li>
                                <NotebookCell
                                    cellId={cell.id}
                                    actions={cellActions}
                                    tag={
                                        cell.tag === "formal"
                                            ? props.cellLabel?.(cell.content)
                                            : undefined
                                    }
                                >
                                    <Switch>
                                        <Match when={cell.tag === "rich-text"}>
                                            <RichTextCellEditor
                                                cellId={cell.id}
                                                handle={props.handle}
                                                path={[...props.path, "cells", i()]}
                                                isActive={isActive()}
                                                actions={cellActions}
                                            />
                                        </Match>
                                        <Match when={cell.tag === "formal"}>
                                            <props.formalCellEditor
                                                content={(cell as FormalCell<T>).content}
                                                changeContent={(f) => {
                                                    props.changeNotebook((nb) => {
                                                        f((nb.cells[i()] as FormalCell<T>).content);
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
            <Show when={props.notebook.cells.some((cell) => cell.tag !== "stem")}>
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
