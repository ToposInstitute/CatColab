import { Match, Switch, useContext } from "solid-js";
import { Dynamic } from "solid-js/web";
import invariant from "tiny-invariant";

import {
    type CellConstructor,
    type FormalCellEditorProps,
    NotebookEditor,
    newFormalCell,
} from "../notebook";
import { compositionPattern } from "../stdlib/analyses";
import type { AnalysisMeta, ModelAnalysisMeta, Theory } from "../theory";
import { LiveAnalysisContext } from "./context";
import {
    type LiveAnalysisDoc,
    type LiveDiagramAnalysisDoc,
    type LiveModelAnalysisDoc,
    theoryForLiveAnalysis,
} from "./document";
import type { Analysis } from "./types";

/** Notebook editor for analyses of models of double theories.
 */
export function AnalysisNotebookEditor(props: { liveAnalysis: LiveAnalysisDoc }) {
    const liveDoc = () => props.liveAnalysis.liveDoc;

    const cellConstructors = () => {
        const theory = theoryForLiveAnalysis(props.liveAnalysis);
        if (!theory) {
            return [];
        }
        if (props.liveAnalysis.analysisType === "model") {
            return analysisCellConstructors(theory);
        } else if (props.liveAnalysis.analysisType === "diagram") {
            return (theory.diagramAnalyses ?? []).map(analysisCellConstructor);
        }
        return [];
    };

    return (
        <LiveAnalysisContext.Provider value={() => props.liveAnalysis}>
            <NotebookEditor
                handle={liveDoc().docHandle}
                path={["notebook"]}
                notebook={liveDoc().doc.notebook}
                changeNotebook={(f) => liveDoc().changeDoc((doc) => f(doc.notebook))}
                formalCellEditor={AnalysisCellEditor}
                cellConstructors={cellConstructors()}
                noShortcuts={true}
            />
        </LiveAnalysisContext.Provider>
    );
}

/** Editor for a notebook cell in an analysis notebook. */
function AnalysisCellEditor(props: FormalCellEditorProps<Analysis<unknown>>) {
    const liveAnalysis = useContext(LiveAnalysisContext);
    invariant(liveAnalysis, "Live analysis should be provided as context for cell editor");

    return (
        <Switch>
            <Match
                when={
                    liveAnalysis().analysisType === "model" &&
                    findModelAnalysis(theoryForLiveAnalysis(liveAnalysis()), props.content.id)
                }
            >
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
            <Match
                when={
                    liveAnalysis().analysisType === "diagram" &&
                    theoryForLiveAnalysis(liveAnalysis())?.diagramAnalysis(props.content.id)
                }
            >
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
    );
}

function analysisCellConstructors(theory: Theory): CellConstructor<Analysis<unknown>>[] {
    const constructors: CellConstructor<Analysis<unknown>>[] = [];
    if (theory.theory.canInstantiateModels() && !theory.modelAnalysis("composition-pattern")) {
        constructors.push(analysisCellConstructor(compositionPattern()));
    }
    for (const meta of theory.modelAnalyses) {
        constructors.push(analysisCellConstructor(meta));
    }
    return constructors;
}

/** Look up a model analysis by ID, including auto-injected ones. */
function findModelAnalysis(theory: Theory | undefined, id: string): ModelAnalysisMeta | undefined {
    return (
        theory?.modelAnalysis(id) ??
        (id === "composition-pattern" && theory?.theory.canInstantiateModels()
            ? compositionPattern()
            : undefined)
    );
}

function analysisCellConstructor<T>(meta: AnalysisMeta<T>): CellConstructor<Analysis<T>> {
    const { id, name, description, initialContent } = meta;
    return {
        name,
        description,
        construct: () =>
            newFormalCell({
                id,
                content: initialContent(),
            }),
    };
}
