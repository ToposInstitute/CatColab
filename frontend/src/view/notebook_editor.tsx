import { DocHandle, Prop } from "@automerge/automerge-repo";
import { Component, createEffect, createSignal, For, onMount, splitProps } from "solid-js";
import { Dynamic } from "solid-js/web";
import { EditorView } from "prosemirror-view";

import { Cell, CellId, Notebook } from "../model/notebook";
import { useDoc } from "../util/automerge_solid";
import { InlineInput } from "./inline_input";
import { RichTextEditor } from "./rich_text_editor";

import "./notebook_editor.css";


/** Actions invokable *within* a cell but affecting the overall notebook state.
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
};

export function RichTextCellEditor(props: {
    cell_id: CellId,
    handle: DocHandle<Notebook<unknown>>,
    path: Prop[],
    isActive: boolean;
    actions: CellActions,
}) {
    const [editorView, setEditorView] = createSignal<EditorView>();

    createEffect(() => {
        const view = editorView();
        if (props.isActive && view) {
            view.focus();
        }
    });

    return (
        <RichTextEditor ref={(view) => setEditorView(view)}
            id={props.cell_id}
            handle={props.handle}
            path={[...props.path, "content"]}
            placeholder="…"
            deleteBackward={props.actions.deleteBackward}
            deleteForward={props.actions.deleteForward}
        />
    );
}

export type FormalCellEditorProps<T> = {
    content: T;
    changeContent: (f: (content: T) => void) => void;
    isActive: boolean;
    actions: CellActions;
}


/** Actions invokable on a notebook editor.
 */
export type NotebookEditorRef<T> = {
    // Get the current notebook data.
    notebook: () => Notebook<T>,

    // Perform an arbitrary change on the notebook data.
    changeNotebook: (f: (nb: Notebook<T>) => void) => void;

    // Add a new cell at the end of the notebook.
    pushCell: (cell: Cell<T>) => void;
};

/** Notebook editor based on Automerge.

A notebook has two types of cells:

1. Rich text cells, managed by Automerge and ProseMirror independently of
   Solid's own state management
2. Formal content cells, with state inside a Solid Store connected to Automerge
 */
export function NotebookEditor<T, Props extends FormalCellEditorProps<T>>(allProps: {
    handle: DocHandle<Notebook<T>>,
    init: Notebook<T>,
    formalCellEditor: Component<Props>;
    ref?: (ref: NotebookEditorRef<T>) => void;
} & {
    [K in Exclude<keyof Props, keyof FormalCellEditorProps<T>>]: Props[K];
}) {
    const [props, otherProps] = splitProps(allProps, [
        "handle", "init", "formalCellEditor", "ref",
    ]);

    const [notebook, changeNotebook] = useDoc(() => props.handle, props.init);

    const [activeCell, setActiveCell] = createSignal(-1, { equals: false });

    onMount(() => {
        props.ref?.({
            notebook,
            changeNotebook,
            pushCell: (cell: Cell<T>) => {
                changeNotebook((nb) => {
                    nb.cells.push(cell);
                    setActiveCell(nb.cells.length - 1);
                });
            },
        });
    });

    return (
        <div class="notebook">
            <div class="notebook-title">
            <InlineInput text={notebook().name}
                setText={(text) => {
                    changeNotebook((nb) => (nb.name = text));
                }}
            />
            </div>
            <ul class="notebook-cells">
            <For each={notebook().cells}>
                {(cell, i) => {
                    const cellActions: CellActions = {
                        activateAbove: () => setActiveCell(i() - 1),
                        activateBelow: () => setActiveCell(i() + 1),
                        deleteBackward: () => changeNotebook((nb) => {
                            nb.cells.splice(i(), 1);
                            setActiveCell(i() - 1);
                        }),
                        deleteForward: () => changeNotebook((nb) => {
                            nb.cells.splice(i(), 1);
                            setActiveCell(i());
                        }),
                    }

                    const editors = {
                        "rich-text": () => <div class="cell markup-cell">
                            <RichTextCellEditor
                                cell_id={cell.id}
                                handle={props.handle}
                                path={["cells", i()]}
                                isActive={activeCell() == i()}
                                actions={cellActions}
                            />
                        </div>,
                        "formal": () => <div class="cell formal-cell">
                            <props.formalCellEditor
                                content={cell.content}
                                changeContent={(f) => {
                                    changeNotebook((nb) => {
                                        f(nb.cells[i()].content as T);
                                    });
                                }}
                                isActive={activeCell() == i()}
                                actions={cellActions}
                                // XXX: How to convince TypeScript that this works?
                                {...otherProps as any}
                            />
                        </div>,
                    };
                    return <li>
                        <Dynamic component={editors[cell.tag]} />
                    </li>;
                }}
            </For>
            </ul>
        </div>
    );
}
