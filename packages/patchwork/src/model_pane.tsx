import type { AnyDocumentId } from "@automerge/automerge-repo";
import { MultiProvider } from "@solid-primitives/context";
import { createResource, Switch, Match } from "solid-js";

import { createModelLibraryWithRepo, ModelLibraryContext } from "../../frontend/src/model";
import { DocumentPane } from "../../frontend/src/page/document_page";
import { TheoryLibraryContext } from "../../frontend/src/theory";
import { stdTheories } from "../../frontend/src/stdlib";
import type { SolidToolProps } from "./tools";

export function ModelPaneComponent(props: SolidToolProps) {
    const models = createModelLibraryWithRepo(props.repo, stdTheories);

    const [liveModel, { refetch }] = createResource(
        () => props.docUrl,
        async (docUrl) => {
            try {
                return await models.getLiveModel(docUrl as AnyDocumentId);
            } catch (error) {
                console.error("=== Model Loading Failed ===");
                console.error("Error:", error);
                console.error("Stack:", (error as Error).stack);
                throw error;
            }
        },
    );

    return (
        <MultiProvider
            values={[
                [TheoryLibraryContext, stdTheories],
                [ModelLibraryContext, models],
            ]}
        >
            <Switch>
                <Match when={liveModel.loading}>
                    <div>⏳ Loading model...</div>
                </Match>
                <Match when={liveModel.error}>
                    <div>❌ Error loading model: {liveModel.error?.message || "Unknown error"}</div>
                </Match>
                <Match when={liveModel()}>
                    {(liveModel) => <DocumentPane document={liveModel()} refetch={refetch} />}
                </Match>
            </Switch>
        </MultiProvider>
    );
}
