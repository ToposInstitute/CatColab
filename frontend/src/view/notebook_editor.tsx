import { For } from "solid-js";
import { Doc } from "@automerge/automerge";
import { Notebook } from "../model/notebook";

export function MarkupCellEditor(props: {
    content: string;
    setContent: (content: string) => void;
}) {
    return (
        <p>{props.content}</p>
    );
}

export type FormalCellEditor<T> =
    (props: {
        content: T;
        modifyContent: (f: (content: T) => void) => void;
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
                                props.modifyNotebook((d) => {
                                    d.cells[i()].content = content;
                                });
                            }}
                        />;
                    } else if (cell.tag == "formal") {
                        return props.editFormalCell({
                            content: cell.content,
                            modifyContent: (f) => {
                                props.modifyNotebook((d) => {
                                    f(d.cells[i()].content as T);
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
