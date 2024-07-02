import { For } from "solid-js";
import { Doc } from "@automerge/automerge";
import { Notebook } from "../model/notebook";

export function MarkupCellEditor(props: {
    content: string;
    setContent: (content: string) => void;
    delete: () => void;
}) {
    return (
        <p>{props.content}</p>
    );
}

export type FormalCellEditor<T> =
    (props: {
        content: T;
        modifyContent: (f: (content: T) => void) => void;
        delete: () => void;
    }) => any;


export function NotebookEditor<T>(props: {
    notebook: Doc<Notebook<T>>;
    modifyNotebook: (f: (d: Notebook<T>) => void) => void;
    editFormalCell: FormalCellEditor<T>;
}) {
    return (
        <div>
            <h1>{props.notebook.name}</h1>
            <ul>
            <For each={props.notebook.cells}>
                {(cell, i) => {
                    if (cell.tag == "markup") {
                        return <MarkupCellEditor
                            content={cell.content}
                            setContent={(content) => {
                                props.modifyNotebook((nb) => {
                                    nb.cells[i()].content = content;
                                });
                            }}
                            delete={() => {
                                props.modifyNotebook((nb) => {
                                    nb.cells.splice(i(), 1);
                                });
                            }}
                        />;
                    } else if (cell.tag == "formal") {
                        return props.editFormalCell({
                            content: cell.content,
                            modifyContent: (f) => {
                                props.modifyNotebook((nb) => {
                                    f(nb.cells[i()].content as T);
                                });
                            },
                            delete: () => {
                                props.modifyNotebook((nb) => {
                                    nb.cells.splice(i(), 1);
                                });
                            },
                        });
                    }
                }}
            </For>
            </ul>
        </div>
    );
}
