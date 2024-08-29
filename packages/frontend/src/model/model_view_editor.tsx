import type { DocHandle, Prop } from "@automerge/automerge-repo";
import { MultiProvider } from "@solid-primitives/context";
import { type Accessor, Show, createContext, useContext } from "solid-js";
import { Dynamic } from "solid-js/web";

import type { DblModel } from "catlog-wasm";
import {
    type CellConstructor,
    type FormalCellEditorProps,
    NotebookEditor,
    newFormalCell,
} from "../notebook";
import type { Theory } from "../theory";
import { TheoryContext } from "./model_context";
import type { ModelNotebookRef } from "./model_notebook_editor";
import type { ModelJudgment, ModelView } from "./types";

/** Notebook editor for model views.
 */
export function ModelViewEditor(props: {
    handle: DocHandle<unknown>;
    path: Prop[];
    modelNotebookRef: ModelNotebookRef;
}) {
    return (
        <MultiProvider
            values={[
                [TheoryContext, props.modelNotebookRef.theory],
                [ModelContext, props.modelNotebookRef.model],
                [ValidatedModelContext, props.modelNotebookRef.validatedModel],
            ]}
        >
            <NotebookEditor
                handle={props.handle}
                path={props.path}
                notebook={props.modelNotebookRef.modelNotebook().analysis}
                changeNotebook={(f) =>
                    props.modelNotebookRef.changeModelNotebook((model) => f(model.analysis))
                }
                formalCellEditor={ModelViewCellEditor}
                cellConstructors={modelViewCellConstructors(props.modelNotebookRef.theory())}
            />
        </MultiProvider>
    );
}

function ModelViewCellEditor(props: FormalCellEditorProps<ModelView<unknown>>) {
    const theory = useContext(TheoryContext);
    const model = useContext(ModelContext);
    const validatedModel = useContext(ValidatedModelContext);

    return (
        <Show when={theory?.()}>
            {(theory) => (
                <Show
                    when={theory().getModelView(props.content.tag)}
                    fallback={<span>Internal error: model view not defined</span>}
                >
                    {(meta) => (
                        <Dynamic
                            component={meta().component}
                            model={model?.() ?? []}
                            validatedModel={validatedModel?.() ?? null}
                            theory={theory()}
                            content={props.content.content}
                            changeContent={(f: (c: unknown) => void) =>
                                props.changeContent((content) => f(content.content))
                            }
                        />
                    )}
                </Show>
            )}
        </Show>
    );
}

function modelViewCellConstructors(theory?: Theory): CellConstructor<ModelView<unknown>>[] {
    return (theory?.modelViews ?? []).map((meta) => {
        const { id, name, description, initialContent } = meta;
        return {
            name,
            description,
            construct: () =>
                newFormalCell({
                    tag: id,
                    content: initialContent(),
                }),
        };
    });
}

/** The model being viewed. */
const ModelContext = createContext<Accessor<Array<ModelJudgment>>>();

/** The `catlog` representation of the model, if the model is valid. */
const ValidatedModelContext = createContext<Accessor<DblModel | null>>();
