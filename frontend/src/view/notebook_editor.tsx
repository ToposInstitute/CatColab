import { For } from "solid-js";
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

export type FormalCellEditor<T> =
    (props: {
        content: T;
        modifyContent: (f: (content: T) => void) => void;
        deleteSelf: () => void;
    }) => any;


export function NotebookEditor<T>(props: {
    notebook: Notebook<T>;
    modifyNotebook: (f: (d: Notebook<T>) => void) => void;
    makeFormalCellEditor: FormalCellEditor<T>;
}) {
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
                        return props.makeFormalCellEditor({
                            content: cell.content,
                            modifyContent: (f) => {
                                props.modifyNotebook((nb) => {
                                    f(nb.cells[i()].content as T);
                                });
                            },
                            deleteSelf: deleteCell,
                        });
                    }
                }}
            </For>
            </ul>
        </div>
    );
}
