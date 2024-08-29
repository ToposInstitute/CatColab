import type { DocHandle, Prop } from "@automerge/automerge-repo";
import { type KbdKey, createShortcut } from "@solid-primitives/keyboard";
import ListPlus from "lucide-solid/icons/list-plus";
import type { EditorView } from "prosemirror-view";
import {
    type Component,
    For,
    Match,
    Show,
    Switch,
    createEffect,
    createSignal,
    onMount,
} from "solid-js";

import { type Completion, IconButton, InlineInput, RichTextEditor } from "../components";
import {
    type Cell,
    type CellId,
    type FormalCell,
    type Notebook,
    newRichTextCell,
    newStemCell,
} from "./types";

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
    cellId: CellId;
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
            id={props.cellId}
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

/** Editor for stem cells; cells that have not been differentiated yet.
 */
export function StemCellEditor(props: {
    completions: Completion[];
    isActive: boolean;
    actions: CellActions;
}) {
    const [text, setText] = createSignal("");

    let ref!: HTMLInputElement;

    onMount(() => ref.focus());

    createEffect(() => {
        if (props.isActive) {
            ref.focus();
        }
    });

    return (
        <InlineInput
            ref={ref}
            text={text()}
            setText={setText}
            completions={props.completions}
            deleteBackward={props.actions.deleteBackward}
            deleteForward={props.actions.deleteForward}
            exitUp={props.actions.activateAbove}
            exitDown={props.actions.activateBelow}
            onFocus={props.actions.hasFocused}
            placeholder="select cell type"
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
    cellLabel?: (content: T) => string | undefined;
    // FIXME: Remove this option once we fix focus management.
    noShortcuts?: boolean;
}) {
    const [activeCell, setActiveCell] = createSignal(props.notebook.cells.length > 0 ? 0 : -1);

    // Set up commands and their keyboard shortcuts.

    const addAfterActiveCell = (cell: Cell<T>) => {
        props.changeNotebook((nb) => {
            nb.cells.splice(activeCell() + 1, 0, cell);
            setActiveCell(activeCell() + 1);
        });
    };

    const addOrReplaceActiveCell = (cell: Cell<T>) => {
        if (props.notebook.cells.length > 0) {
            const c = props.notebook.cells[activeCell()];
            if (c.tag === "formal" || c.tag === "rich-text") {
                addAfterActiveCell(cell);
            } else if (c.tag === "stem") {
                replaceCellWith(activeCell(), cell);
            }
        } else {
            addAfterActiveCell(cell);
        }
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

    return (
        <div class="notebook">
            <Show when={props.notebook.cells.length === 0}>
                <div class="notebook-empty placeholder">
                    <IconButton onClick={() => addAfterActiveCell(newStemCell())}>
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
                                <Switch>
                                    <Match when={cell.tag === "rich-text"}>
                                        <div class="cell markup-cell">
                                            <div class="cell-content">
                                                <RichTextCellEditor
                                                    cellId={cell.id}
                                                    handle={props.handle}
                                                    path={[...props.path, "cells", i()]}
                                                    isActive={isActive()}
                                                    actions={cellActions}
                                                />
                                            </div>
                                        </div>
                                    </Match>
                                    <Match when={cell.tag === "formal" && cell}>
                                        <div class="cell formal-cell">
                                            <div class="cell-content">
                                                <props.formalCellEditor
                                                    content={(cell as FormalCell<T>).content}
                                                    changeContent={(f) => {
                                                        props.changeNotebook((nb) => {
                                                            f(
                                                                (nb.cells[i()] as FormalCell<T>)
                                                                    .content,
                                                            );
                                                        });
                                                    }}
                                                    isActive={isActive()}
                                                    actions={cellActions}
                                                />
                                            </div>
                                            <Show when={props.cellLabel}>
                                                <div class="cell-tag">
                                                    {props.cellLabel?.(
                                                        (cell as FormalCell<T>).content,
                                                    )}
                                                </div>
                                            </Show>
                                        </div>
                                    </Match>
                                    <Match when={cell.tag === "stem"}>
                                        <div class="cell stem-cell">
                                            <StemCellEditor
                                                completions={replaceCommands(i())}
                                                isActive={isActive()}
                                                actions={cellActions}
                                            />
                                        </div>
                                    </Match>
                                </Switch>
                            </li>
                        );
                    }}
                </For>
            </ul>
            <Show when={props.notebook.cells.some((cell) => cell.tag !== "stem")}>
                <div class="placeholder">
                    <IconButton onClick={() => addAfterActiveCell(newStemCell())}>
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
