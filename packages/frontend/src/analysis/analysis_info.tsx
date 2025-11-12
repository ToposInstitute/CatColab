import { A } from "@solidjs/router";

import type { LiveAnalysisDoc } from "./document";

/** Widget in the top right corner of a diagram document pane.
 */
export function AnalysisInfo(props: { liveAnalysis: LiveAnalysisDoc }) {
    const parentName = () => analysisParentName(props.liveAnalysis) || "Untitled";
    const parentUrl = () => analysisParentUrl(props.liveAnalysis);

    return (
        <>
            <div class="name">Analysis</div>
            <div class="model">
                <A href={parentUrl()}>{parentName()}</A>
            </div>
        </>
    );
}

function analysisParentUrl(liveAnalysis: LiveAnalysisDoc): string {
    const analysisType = liveAnalysis.analysisType;
    const parentRefId = liveAnalysis.liveDoc.doc.analysisOf._id;

    return `/${analysisType}/${parentRefId}`;
}

function analysisParentName(liveAnalysis: LiveAnalysisDoc): string {
    if (liveAnalysis.analysisType === "diagram") {
        return liveAnalysis.liveDiagram.liveDoc.doc.name;
    } else {
        return liveAnalysis.liveModel.liveDoc.doc.name;
    }
}
