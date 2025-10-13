import { useNavigate } from "@solidjs/router";
import invariant from "tiny-invariant";

import { createAnalysis } from "../analysis/document";
import { useApi } from "../api";
import { type LiveDiagramDocument, createDiagram } from "../diagram/document";
import {
    AppMenu,
    CopyJSONMenuItem,
    DuplicateMenuItem,
    ExportJSONMenuItem,
    ImportMenuItem,
    MenuItem,
    MenuItemLabel,
    MenuSeparator,
} from "../page";

import ChartSpline from "lucide-solid/icons/chart-spline";
import FilePlus from "lucide-solid/icons/file-plus";

/** Hamburger menu for a diagram document. */
export function DiagramMenu(props: {
    liveDiagram: LiveDiagramDocument;
}) {
    const api = useApi();
    const navigate = useNavigate();

    const liveDoc = () => props.liveDiagram.liveDoc;

    const onNewDiagram = async () => {
        const modelRef = props.liveDiagram.liveDoc.doc.diagramIn;
        const newRef = await createDiagram(api, modelRef);
        navigate(`/diagram/${newRef}`);
    };

    const onNewAnalysis = async () => {
        const refId = props.liveDiagram.liveDoc.docRef?.refId;
        invariant(refId, "To create analysis, parent diagram should have a ref ID");

        const newRef = await createAnalysis(api, "diagram", api.makeUnversionedRef(refId));
        navigate(`/analysis/${newRef}`);
    };

    return (
        <AppMenu>
            <MenuItem onSelect={() => onNewDiagram()}>
                <FilePlus />
                <MenuItemLabel>{"New diagram"}</MenuItemLabel>
            </MenuItem>
            <MenuItem onSelect={() => onNewAnalysis()}>
                <ChartSpline />
                <MenuItemLabel>{`New analysis of this ${props.liveDiagram.type}`}</MenuItemLabel>
            </MenuItem>
            <ImportMenuItem />
            <MenuSeparator />
            <DuplicateMenuItem doc={liveDoc().doc} />
            <ExportJSONMenuItem doc={liveDoc().doc} />
            <CopyJSONMenuItem doc={liveDoc().doc} />
        </AppMenu>
    );
}
