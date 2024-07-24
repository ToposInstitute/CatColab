import type { DocHandle, Prop } from "@automerge/automerge-repo";
import Popover from "@corvu/popover";
import type { FloatingOptions } from "@corvu/popover";
import { type KbdKey, createShortcut } from "@solid-primitives/keyboard";
import type { EditorView } from "prosemirror-view";
import { type Component, For, Match, Show, Switch, createEffect, createSignal } from "solid-js";

import { type Command, CommandMenu, RichTextEditor } from "../components";
import type { Cell, CellId, Notebook } from "./types";

import "./notebook_editor.css";

/** Actions invokable *within* a cell but affecting the larger notebook state.

Through these functions, a cell can request to perform an action on the notebook
or inform the notebook that an action has occcured within the cell.
*/
export type CellActions = {
    // Activate the cell above this one.
    activateAbove: () => void;

    // Activate the cell below this one.
    activateBelow: () => void;

    // Delete this cell in the backward/upward direction.
    deleteBackward: () => void;

    // Delete this cell in the forward/downward direction.
    deleteForward: () => void;

    // The cell has received focus.
    hasFocused: () => void;
};

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
};

/** Editor for rich text cells, a simple wrapper around `RichTextEditor`.
 */
export function RichTextCellEditor(props: {
    cell_id: CellId;
    handle: DocHandle<unknown>;
    path: Prop[];
    isActive: boolean;
    actions: CellActions;
}) {
    const [editorView, setEditorView] = createSignal<EditorView>();

    createEffect(() => {
        const view = editorView();
        if (props.isActive && view) {
            view.focus();
        }
    });

    return (
        <RichTextEditor
            ref={(view) => setEditorView(view)}
            id={props.cell_id}
            handle={props.handle}
            path={[...props.path, "content"]}
            placeholder="…"
            deleteBackward={props.actions.deleteBackward}
            deleteForward={props.actions.deleteForward}
            exitUp={props.actions.activateAbove}
            exitDown={props.actions.activateBelow}
            onFocus={props.actions.hasFocused}
        />
    );
}

/** Interface for editors of cells with formal content.
 */
export type FormalCellEditorProps<T> = {
    content: T;
    changeContent: (f: (content: T) => void) => void;
    isActive: boolean;
    actions: CellActions;
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
}) {
    const [activeCell, setActiveCell] = createSignal(0);

    // Set up commands and their keyboard shortcuts.
    const addAfterActiveCell = (cell: Cell<T>) => {
        props.changeNotebook((nb) => {
            const n = nb.cells.length;
            const i = Math.min(Math.max(activeCell() + 1, 0), n);
            nb.cells.splice(i, 0, cell);
            setActiveCell(i);
        });
    };
    const commands = (): Command[] =>
        props.cellConstructors.map((cc) => {
            const { name, description, shortcut } = cc;
            return {
                name,
                description,
                shortcut,
                execute: () => addAfterActiveCell(cc.construct()),
            };
        });
    createEffect(() => {
        for (const command of commands()) {
            if (command.shortcut) {
                createShortcut(command.shortcut, command.execute);
            }
        }
    });

    // Set up popup menu to create new cells.
    const [isCellMenuOpen, setIsCellMenuOpen] = createSignal(false);

    createShortcut(["Shift", "Enter"], () => setIsCellMenuOpen(true));

    return (
        <div class="notebook">
            <Show when={props.notebook.cells.length === 0}>
                <div class="notebook-empty">
                    <Popover
                        open={isCellMenuOpen()}
                        onOpenChange={setIsCellMenuOpen}
                        floatingOptions={cellMenuFloatingOptions}
                    >
                        <Popover.Anchor>
                            <span class="placeholder">Press Shift-Enter to create a cell</span>
                        </Popover.Anchor>
                        <Popover.Portal>
                            <Popover.Content class="notebook-cell-menu">
                                <CommandMenu
                                    commands={commands()}
                                    onExecuted={() => setIsCellMenuOpen(false)}
                                />
                            </Popover.Content>
                        </Popover.Portal>
                    </Popover>
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
                            activateBelow: () => {
                                const n = props.notebook.cells.length;
                                i() < n - 1 && setActiveCell(i() + 1);
                            },
                            deleteBackward: () =>
                                props.changeNotebook((nb) => {
                                    nb.cells.splice(i(), 1);
                                    setActiveCell(i() - 1);
                                }),
                            deleteForward: () =>
                                props.changeNotebook((nb) => {
                                    nb.cells.splice(i(), 1);
                                    setActiveCell(i());
                                }),
                            hasFocused: () => {
                                setActiveCell(i());
                            },
                        };

                        return (
                            <li>
                                <Popover
                                    open={isCellMenuOpen() && isActive()}
                                    onOpenChange={setIsCellMenuOpen}
                                    restoreFocus={isActive()}
                                    floatingOptions={cellMenuFloatingOptions}
                                >
                                    <Popover.Anchor>
                                        <Switch>
                                            <Match when={cell.tag === "rich-text"}>
                                                <div class="cell markup-cell">
                                                    <RichTextCellEditor
                                                        cell_id={cell.id}
                                                        handle={props.handle}
                                                        path={[...props.path, "cells", i()]}
                                                        isActive={isActive()}
                                                        actions={cellActions}
                                                    />
                                                </div>
                                            </Match>
                                            <Match when={cell.tag === "formal"}>
                                                <div class="cell formal-cell">
                                                    <props.formalCellEditor
                                                        content={cell.content as T}
                                                        changeContent={(f) => {
                                                            props.changeNotebook((nb) => {
                                                                f(nb.cells[i()].content as T);
                                                            });
                                                        }}
                                                        isActive={isActive()}
                                                        actions={cellActions}
                                                    />
                                                </div>
                                            </Match>
                                        </Switch>
                                    </Popover.Anchor>
                                    <Popover.Portal>
                                        <Popover.Content class="notebook-cell-menu">
                                            <CommandMenu
                                                commands={commands()}
                                                onExecuted={() => setIsCellMenuOpen(false)}
                                            />
                                        </Popover.Content>
                                    </Popover.Portal>
                                </Popover>
                            </li>
                        );
                    }}
                </For>
            </ul>
        </div>
    );
}

const cellMenuFloatingOptions: FloatingOptions = {
    autoPlacement: {
        allowedPlacements: ["bottom-start", "top-start"],
    },
};
