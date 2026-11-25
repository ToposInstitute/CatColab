import type { ModelAnalysisBuilder, ModelAnalysisProps } from "../../analysis";
import type { AnalysisManifest } from "../../plugin";
import { type MotifFinder, type MotifFindingContent, newMotifFindingContent } from "./types";

export function loadMotifFindingAnalysis(
    loadMotifFinder: () => Promise<MotifFinder>,
): (manifest: AnalysisManifest) => Promise<ModelAnalysisBuilder<MotifFindingContent>> {
    return async (manifest) => {
        const finder = await loadMotifFinder();
        const SubmodelGraphs = (await import("./submodel_graphs")).default;

        return {
            contentVersion: 0,
            initialContent: newMotifFindingContent,
            component: (props: ModelAnalysisProps<MotifFindingContent>) => (
                <SubmodelGraphs findSubmodels={finder} title={manifest.label} {...props} />
            ),
        };
    };
}
