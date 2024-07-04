import { Component, For, splitProps } from "solid-js";
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
                        });
                    if (cell.tag == "markup") {
                        return <MarkupCellEditor
                            content={cell.content}
                            setContent={(content) => {
                                props.modifyNotebook((nb) => {
                                    nb.cells[i()].content = content;
                                });
                            }}
                            deleteSelf={deleteCell}
                        />;
                    } else if (cell.tag == "formal") {
                        return <props.formalCellEditor
                            content={cell.content}
                            modifyContent={(f) => {
                                props.modifyNotebook((nb) => {
                                    f(nb.cells[i()].content as T);
                                });
                            }}
                            deleteSelf={deleteCell}
                            {...otherProps as any} // FIXME: How to convince TypeScript that this works?
                        />;
                    }
                }}
            </For>
            </ul>
        </div>
    );
}
