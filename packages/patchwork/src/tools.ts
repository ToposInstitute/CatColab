import type { Repo } from "@automerge/automerge-repo";
import { useDocHandle, useDocument, useRepo } from "@automerge/automerge-repo-react-hooks";
import type { EditorProps } from "@patchwork/sdk";
import type { Cell, Uuid } from "catlog-wasm";
import React, { useEffect, useMemo, useRef } from "react";
import type { JSX } from "solid-js";

import { createComponent, render } from "solid-js/web";
import type { AnalysisDoc } from "./analysis_datatype";
import { AnalysisPaneComponent } from "./analysis_pane";
import type { ModelDoc } from "./model_datatype";
import { ModelPaneComponent } from "./model_pane";
import "./tools.css";

export type SolidToolProps = {
    docUrl: string;
    repo: Repo;
};

export const ModelTool: React.FC<EditorProps<Uuid, Cell<unknown>>> = ({ docUrl }) => {
    return React.createElement(Tool, {
        docUrl,
        solidComponent: ModelPaneComponent,
    });
};

export const AnalysisTool: React.FC<EditorProps<Uuid, Cell<unknown>>> = ({ docUrl }) => {
    const [modelDoc] = useDocument<ModelDoc>(docUrl, { suspense: true });

    const analysisDocUrl = modelDoc.analysisDocUrl;

    const resolvedAnalysisDocUrl = useMemo(() => analysisDocUrl, [modelDoc.analysisDocUrl]);
    const resolvedModelDocUrl = useMemo(() => docUrl, [docUrl]);

    const analysisDocHandle = useDocHandle<AnalysisDoc>(resolvedAnalysisDocUrl, {
        suspense: true,
    });

    // hack: update the analysis document to point to the current model document
    //
    // Why do we need to do this?
    //
    // when we create a branch of a model document this creates a copy of the analysis document
    // so both documents are branched together
    //
    // the problem is that the forked analysis document still points to the original model document
    // the correct solution would be to resolve the url to point to the forked model document
    // but that would involve pushing the resolve logic down into the frontend package
    // since the whole branch scope resolution is very hacky right now I want to avoid that
    useEffect(() => {
        if (
            !modelDoc ||
            !analysisDocHandle ||
            analysisDocHandle.doc()?.analysisOf?._id === resolvedModelDocUrl
        ) {
            return;
        }
        analysisDocHandle.change((doc) => {
            doc.analysisOf = {
                _id: resolvedModelDocUrl,
            };
        });
    }, [resolvedAnalysisDocUrl, modelDoc, analysisDocHandle]);

    if (!resolvedAnalysisDocUrl) {
        return null;
    }

    return React.createElement(Tool, {
        docUrl: resolvedAnalysisDocUrl,
        solidComponent: AnalysisPaneComponent,
    });
};

export const SideBySideTool: React.FC<EditorProps<Uuid, Cell<unknown>>> = (props) => {
    return React.createElement("div", { className: "split-view-container" }, [
        React.createElement("div", { className: "split-view-pane" }, [
            React.createElement(ModelTool, props),
        ]),
        React.createElement("div", { className: "split-view-divider" }),
        React.createElement("div", { className: "split-view-pane" }, [
            React.createElement("h1", {}, "Analysis"),
            React.createElement(AnalysisTool, props),
        ]),
    ]);
};

const Tool: React.FC<
    EditorProps<Uuid, Cell<unknown>> & {
        solidComponent?: (props: SolidToolProps) => JSX.Element;
    }
> = ({ docUrl, solidComponent = ModelPaneComponent }) => {
    const handle = useDocHandle<ModelDoc>(docUrl, { suspense: true });
    const repo = useRepo();

    const solidContainerRef = useRef<HTMLDivElement>(null);
    const solidDisposeRef = useRef<(() => void) | null>(null);

    // mount the solid component once the handle and repo are available
    useEffect(() => {
        if (!handle || !repo) {
            return;
        }

        if (solidContainerRef.current) {
            // Clean up previous render
            if (solidDisposeRef.current) {
                solidDisposeRef.current();
            }

            solidDisposeRef.current = render(
                () =>
                    createComponent(solidComponent, {
                        docUrl,
                        repo,
                    }),
                solidContainerRef.current,
            );
        }

        // Cleanup on unmount
        return () => {
            if (solidDisposeRef.current) {
                solidDisposeRef.current();
                solidDisposeRef.current = null;
            }
        };
    }, [docUrl, handle, solidComponent]);

    if (!handle) {
        return null;
    }

    // We use React.createElement here to avoid bringing in React's JSX transform.
    // We had some trouble with combining both solid and react JSX in one build.
    return React.createElement("div", {
        className: "catcolab-patchwork",
        ref: solidContainerRef,
        style: { height: "100%", overflowY: "scroll" },
    });
};
