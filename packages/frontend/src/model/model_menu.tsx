import { useNavigate } from "@solidjs/router";
import { Show } from "solid-js";

import { createAnalysis } from "../analysis/document";
import { useApi } from "../api";
import { createDiagram } from "../diagram/document";
import { HamburgerMenu, MenuItem, MenuItemLabel } from "../page";
import { type LiveModelDocument, createModel } from "./document";

import ChartSpline from "lucide-solid/icons/chart-spline";
import FilePlus from "lucide-solid/icons/file-plus";
import Network from "lucide-solid/icons/network";

/** Hamburger menu for a model. */
export function ModelMenu(props: {
    liveModel?: LiveModelDocument;
}) {
    return (
        <HamburgerMenu disabled={props.liveModel === undefined}>
            <Show when={props.liveModel}>
                {(liveModel) => <ModelMenuItems liveModel={liveModel()} />}
            </Show>
        </HamburgerMenu>
    );
}

/** Menu items for a model. */
export function ModelMenuItems(props: {
    liveModel: LiveModelDocument;
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

    const onNewAnalysis = async (modelRefId: string) => {
        const newRef = await createAnalysis("model", modelRefId, api);
        navigate(`/analysis/${newRef}`);
    };

    return (
        <>
            <MenuItem onSelect={onNewModel}>
                <FilePlus />
                <MenuItemLabel>{"New model"}</MenuItemLabel>
            </MenuItem>
            <MenuItem onSelect={() => onNewAnalysis(props.liveModel.refId)}>
                <ChartSpline />
                <MenuItemLabel>{"New analysis of this model"}</MenuItemLabel>
            </MenuItem>
            <Show when={props.liveModel.theory()?.supportsInstances}>
                <MenuItem onSelect={() => onNewDiagram(props.liveModel.refId)}>
                    <Network />
                    <MenuItemLabel>{"New diagram in this model"}</MenuItemLabel>
                </MenuItem>
            </Show>
        </>
    );
}
