import { createResource, ErrorBoundary, Match, Switch, useContext } from "solid-js";
import { Dynamic } from "solid-js/web";
import invariant from "tiny-invariant";

import { Nb } from "catcolab-document-methods";
import { ErrorAlert, type FocusHandle } from "catcolab-ui-components";
import { type CellConstructor, type FormalCellEditorProps, NotebookEditor } from "../notebook";
import { type AnalysisManifest, PluginRegistryContext } from "../plugin";
import { LiveAnalysisContext } from "./context";
import {
    type LiveAnalysisDoc,
    type LiveDiagramAnalysisDoc,
    type LiveModelAnalysisDoc,
    theoryForLiveAnalysis,
} from "./document";
import type { Analysis, AnalysisBuilder } from "./types";

/** Notebook editor for analyses of models of double theories.
 */
export function AnalysisNotebookEditor(props: {
    liveAnalysis: LiveAnalysisDoc;
    focus: FocusHandle;
}) {
    const liveDoc = () => props.liveAnalysis.liveDoc;

    const plugins = useContext(PluginRegistryContext);
    invariant(plugins, "Plugin registry should be provided as context");

    const cellConstructors = () => {
        const theory = theoryForLiveAnalysis(props.liveAnalysis);
        if (!theory) {
            return [];
        }
        const key = { doctrine: theory.theory.doctrine, theory: theory.id };
        return plugins
            .analyses(props.liveAnalysis.analysisType, key)
            .map((manifest) =>
                analysisCellConstructor(manifest, () => plugins.analysisBuilder(manifest.id)),
            );
    };

    // oxlint-disable solid/reactivity -- Context.Provider value getter is reactive
    return (
        <LiveAnalysisContext.Provider value={() => props.liveAnalysis}>
            <NotebookEditor
                handle={liveDoc().docHandle}
                path={["notebook"]}
                notebook={liveDoc().doc.notebook}
                changeNotebook={(f) => liveDoc().changeDoc((doc) => f(doc.notebook))}
                formalCellEditor={AnalysisCellEditor}
                cellConstructors={cellConstructors()}
                focus={props.focus}
            />
        </LiveAnalysisContext.Provider>
    );
}

/** Editor for a notebook cell in an analysis notebook. */
function AnalysisCellEditor(props: FormalCellEditorProps<Analysis<unknown>>) {
    const liveAnalysis = useContext(LiveAnalysisContext);
    invariant(liveAnalysis, "Live analysis should be provided as context for cell editor");
    const plugins = useContext(PluginRegistryContext);
    invariant(plugins, "Plugin registry should be provided as context");

    const [modelAnalysis] = createResource(
        () => liveAnalysis().analysisType === "model" && props.content.id,
        (id) => plugins.modelAnalysisBuilder(id),
    );
    const [diagramAnalysis] = createResource(
        () => liveAnalysis().analysisType === "diagram" && props.content.id,
        (id) => plugins.diagramAnalysisBuilder(id),
    );

    const errorTitle = () => {
        const name = plugins.analysisManifest(props.content.id)?.name;
        return name ? `Error in analysis: ${name}` : "Analysis error";
    };

    return (
        <ErrorBoundary
            fallback={(err) => (
                <ErrorAlert title={errorTitle()}>
                    {err instanceof Error ? err.message : String(err)}
                </ErrorAlert>
            )}
        >
            <Switch>
                <Match when={modelAnalysis()}>
                    {(analysis) => (
                        <Dynamic
                            component={analysis().component}
                            liveModel={(liveAnalysis() as LiveModelAnalysisDoc).liveModel}
                            content={props.content.content}
                            changeContent={(f: (c: unknown) => void) =>
                                props.changeContent((content) => f(content.content))
                            }
                        />
                    )}
                </Match>
                <Match when={diagramAnalysis()}>
                    {(analysis) => (
                        <Dynamic
                            component={analysis().component}
                            liveDiagram={(liveAnalysis() as LiveDiagramAnalysisDoc).liveDiagram}
                            content={props.content.content}
                            changeContent={(f: (c: unknown) => void) =>
                                props.changeContent((content) => f(content.content))
                            }
                        />
                    )}
                </Match>
            </Switch>
        </ErrorBoundary>
    );
}

function analysisCellConstructor<T>(
    manifest: AnalysisManifest,
    loadBuilder: () => Promise<AnalysisBuilder<T>>,
): CellConstructor<Analysis<T>> {
    const { id, name, description } = manifest;
    return {
        name,
        description,
        construct: async () => {
            const builder = await loadBuilder();
            return Nb.newFormalCell({
                id,
                content: builder.initialContent(),
            });
        },
    };
}
