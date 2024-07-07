import { Component, createSignal, For, onMount, splitProps } from "solid-js";
import { Dynamic } from "solid-js/web";

import { Cell, Notebook } from "../model/notebook";
import { InlineInput } from "./input";

import "./notebook_editor.css";


// Actions that can be invoked *within* a cell editor but affect the overall
// notebook state.
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

export function MarkupCellEditor(props: {
    content: string;
    setContent: (content: string) => void;
    isActive: boolean;
    actions: CellActions,
}) {
    return (
        <p>{props.content}</p>
    );
}

export type FormalCellEditorProps<T> = {
    content: T;
    modifyContent: (f: (content: T) => void) => void;
    isActive: boolean;
    actions: CellActions;
}


export type NotebookEditorRef<T> = {
    pushCell: (cell: Cell<T>) => void;
};

export function NotebookEditor<T, Props extends FormalCellEditorProps<T>>(allProps: {
    notebook: Notebook<T>;
    modifyNotebook: (f: (d: Notebook<T>) => void) => void;
    formalCellEditor: Component<Props>;
    ref?: (ref: NotebookEditorRef<T>) => void;
} & {
    [K in Exclude<keyof Props, keyof FormalCellEditorProps<T>>]: Props[K];
}) {
    const [props, otherProps] = splitProps(allProps, [
        "notebook", "modifyNotebook", "formalCellEditor", "ref",
    ]);

    const [activeCell, setActiveCell] = createSignal(-1, { equals: false });

    onMount(() => {
        props.ref?.({
            pushCell: (cell: Cell<T>) => {
                props.modifyNotebook((nb) => {
                    nb.cells.push(cell);
                    setActiveCell(nb.cells.length - 1);
                });
            },
        });
    });

    return (
        <div class="notebook">
            <div class="notebook-title">
                <InlineInput text={props.notebook.name}
                setText={(text) => {
                    props.modifyNotebook((nb) => (nb.name = text));
                }}
                />
            </div>
            <ul class="notebook-cells">
            <For each={props.notebook.cells}>
                {(cell, i) => {
                    const cellActions: CellActions = {
                        activateAbove: () => setActiveCell(i() - 1),
                        activateBelow: () => setActiveCell(i() + 1),
                        deleteBackward: () => props.modifyNotebook((nb) => {
                            nb.cells.splice(i(), 1);
                            setActiveCell(i() - 1);
                        }),
                        deleteForward: () => props.modifyNotebook((nb) => {
                            nb.cells.splice(i(), 1);
                            setActiveCell(i());
                        }),
                    }

                    const editors = {
                        markup: () => <div class="cell markup-cell">
                            <MarkupCellEditor
                                content={cell.content as string}
                                setContent={(content) => {
                                    props.modifyNotebook((nb) => {
                                        nb.cells[i()].content = content;
                                    });
                                }}
                                isActive={activeCell() == i()}
                                actions={cellActions}
                            />
                        </div>,
                        formal: () => <div class="cell formal-cell">
                            <props.formalCellEditor
                                content={cell.content}
                                modifyContent={(f) => {
                                    props.modifyNotebook((nb) => {
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
