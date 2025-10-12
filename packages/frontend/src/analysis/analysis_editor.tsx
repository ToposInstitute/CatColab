import { Match, Switch, useContext } from "solid-js";
import { Dynamic } from "solid-js/web";
import invariant from "tiny-invariant";

import {
    type CellConstructor,
    type FormalCellEditorProps,
    NotebookEditor,
    newFormalCell,
} from "../notebook";
import type { AnalysisMeta } from "../theory";
import { assertExhaustive } from "../util/assert_exhaustive";
import { LiveAnalysisContext } from "./context";
import type {
    LiveAnalysisDocument,
    LiveDiagramAnalysisDocument,
    LiveModelAnalysisDocument,
} from "./document";
import type { Analysis } from "./types";

/** Notebook editor for analyses of models of double theories.
 */
export function AnalysisNotebookEditor(props: {
    liveAnalysis: LiveAnalysisDocument;
}) {
    const liveDoc = () => props.liveAnalysis.liveDoc;

    const cellConstructors = () => {
        let meta = undefined;
        if (props.liveAnalysis.analysisType === "model") {
            meta = theoryForAnalysis(props.liveAnalysis)?.modelAnalyses;
        } else if (props.liveAnalysis.analysisType === "diagram") {
            meta = theoryForAnalysis(props.liveAnalysis)?.diagramAnalyses;
        }
        return (meta ?? []).map(analysisCellConstructor);
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
                    theoryForAnalysis(liveAnalysis())?.modelAnalysis(props.content.id)
                }
            >
                {(analysis) => (
                    <Dynamic
                        component={analysis().component}
                        liveModel={(liveAnalysis() as LiveModelAnalysisDocument).liveModel}
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
                    theoryForAnalysis(liveAnalysis())?.diagramAnalysis(props.content.id)
                }
            >
                {(analysis) => (
                    <Dynamic
                        component={analysis().component}
                        liveDiagram={(liveAnalysis() as LiveDiagramAnalysisDocument).liveDiagram}
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

function theoryForAnalysis(liveAnalysis: LiveAnalysisDocument) {
    switch (liveAnalysis.analysisType) {
        case "model":
            return liveAnalysis.liveModel.theory();
        case "diagram":
            return liveAnalysis.liveDiagram.liveModel.theory();
        default:
            assertExhaustive(liveAnalysis);
    }
}
