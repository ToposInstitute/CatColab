import { Component, For, splitProps } from "solid-js";
import { Dynamic } from "solid-js/web";
import { Notebook } from "../model/notebook";

import "./notebook_editor.css";


export function MarkupCellEditor(props: {
    content: string;
    setContent: (content: string) => void;
    deleteSelf: () => void;
}) {
    return (
        <p>{props.content}</p>
    );
}

export type FormalCellEditorProps<T> = {
    content: T;
    modifyContent: (f: (content: T) => void) => void;
    deleteSelf: () => void;
}

export function NotebookEditor<T, Props extends FormalCellEditorProps<T>>(allProps: {
    notebook: Notebook<T>;
    modifyNotebook: (f: (d: Notebook<T>) => void) => void;
    formalCellEditor: Component<Props>;
} & {
    [K in Exclude<keyof Props, keyof FormalCellEditorProps<T>>]: Props[K];
}) {
    const [props, otherProps] = splitProps(allProps, [
        "notebook", "modifyNotebook", "formalCellEditor"
    ]);
    return (
        <div id="notebook">
            <div id="notebook-title">
                <input type="text" value={props.notebook.name}
                onInput={(evt) => {
                    props.modifyNotebook((nb) => (nb.name = evt.target.value));
                }}
                ></input>
            </div>
            <ul>
            <For each={props.notebook.cells}>
                {(cell, i) => {
                    const deleteCell = () =>
                        props.modifyNotebook((nb) => {
                            nb.cells.splice(i(), 1);
                        })

                    const editors = {
                        markup: () => <MarkupCellEditor
                            content={cell.content as string}
                            setContent={(content) => {
                                props.modifyNotebook((nb) => {
                                    nb.cells[i()].content = content;
                                });
                            }}
                            deleteSelf={deleteCell}
                        />,
                        formal: () => <props.formalCellEditor
                            content={cell.content}
                            modifyContent={(f) => {
                                props.modifyNotebook((nb) => {
                                    f(nb.cells[i()].content as T);
                                });
                            }}
                            deleteSelf={deleteCell}
                            // XXX: How to convince TypeScript that this works?
                            {...otherProps as any}
                        />,
                    };
                    return <Dynamic component={editors[cell.tag]} />;
                }}
            </For>
            </ul>
        </div>
    );
}
