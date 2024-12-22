import { useNavigate } from "@solidjs/router";
import { Show } from "solid-js";

import { createAnalysis } from "../analysis/document";
import { useApi } from "../api";
import { createModel } from "../model/document";
import { HamburgerMenu, MenuItem, MenuItemLabel } from "../page";
import { type LiveDiagramDocument, createDiagram } from "./document";

import ChartSpline from "lucide-solid/icons/chart-spline";
import FilePlus from "lucide-solid/icons/file-plus";
import Network from "lucide-solid/icons/network";

/** Hamburger menu for a diagram in a model. */
export function DiagramMenu(props: {
    liveDiagram?: LiveDiagramDocument;
}) {
    return (
        <HamburgerMenu disabled={props.liveDiagram === undefined}>
            <Show when={props.liveDiagram}>
                {(liveDiagram) => <DiagramMenuItems liveDiagram={liveDiagram()} />}
            </Show>
        </HamburgerMenu>
    );
}

/** Menu items for a diagram in a model. */
export function DiagramMenuItems(props: {
    liveDiagram: LiveDiagramDocument;
}) {
    const api = useApi();
    const navigate = useNavigate();

    const onNewModel = async () => {
        const newRef = await createModel(api);
        navigate(`/model/${newRef}`);
    };

    const onNewDiagram = async (modelRefId: string) => {
        const newRef = await createDiagram(modelRefId, api);
        navigate(`/diagram/${newRef}`);
    };

    const onNewAnalysis = async (diagramRefId: string) => {
        const newRef = await createAnalysis("diagram", diagramRefId, api);
        navigate(`/analysis/${newRef}`);
    };

    return (
        <>
            <MenuItem onSelect={onNewModel}>
                <FilePlus />
                <MenuItemLabel>{"New model"}</MenuItemLabel>
            </MenuItem>
            <MenuItem onSelect={() => onNewDiagram(props.liveDiagram.liveModel.refId)}>
                <Network />
                <MenuItemLabel>{"New diagram"}</MenuItemLabel>
            </MenuItem>
            <MenuItem onSelect={() => onNewAnalysis(props.liveDiagram.refId)}>
                <ChartSpline />
                <MenuItemLabel>{"New analysis of this diagram"}</MenuItemLabel>
            </MenuItem>
        </>
    );
}
