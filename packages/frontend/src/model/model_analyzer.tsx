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
import type { ModelAnalysisMeta } from "../theory";
import { TheoryContext } from "./model_context";
import type { ModelNotebookRef } from "./model_notebook_editor";
import type { ModelAnalysis, ModelJudgment } from "./types";

/** Notebook editor for analyses of models of double theories.
 */
export function ModelAnalyzer(props: {
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
                formalCellEditor={ModelAnalysisCellEditor}
                cellConstructors={modelAnalysisCellConstructors(
                    props.modelNotebookRef.theory()?.modelAnalyses ?? [],
                )}
                noShortcuts={true}
            />
        </MultiProvider>
    );
}

function ModelAnalysisCellEditor(props: FormalCellEditorProps<ModelAnalysis<unknown>>) {
    const theory = useContext(TheoryContext);
    const model = useContext(ModelContext);
    const validatedModel = useContext(ValidatedModelContext);

    return (
        <Show when={theory?.()}>
            {(theory) => (
                <Show
                    when={theory().getModelAnalysis(props.content.tag)}
                    fallback={<span>Internal error: model view not defined</span>}
                >
                    {(analysis) => (
                        <Dynamic
                            component={analysis().component}
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

function modelAnalysisCellConstructors(
    analyses: ModelAnalysisMeta[],
): CellConstructor<ModelAnalysis<unknown>>[] {
    return analyses.map((analysis) => {
        const { id, name, description, initialContent } = analysis;
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

/** The model being analyzed. */
const ModelContext = createContext<Accessor<Array<ModelJudgment>>>();

/** The `catlog` representation of the model, if the model is valid. */
const ValidatedModelContext = createContext<Accessor<DblModel | null>>();
