import { useNavigate } from "@solidjs/router";
import { Show } from "solid-js";

import { createAnalysis } from "../analysis/document";
import { useApi } from "../api";
import { createDiagram } from "../diagram/document";
import { AppMenu, MenuItem, MenuItemLabel, MenuSeparator, NewModelItem } from "../page";
import { type LiveModelDocument, type ModelDocument, createModel } from "./document";

import ChartSpline from "lucide-solid/icons/chart-spline";
import Copy from "lucide-solid/icons/copy";
import Network from "lucide-solid/icons/network";

/** Hamburger menu for a model of a double theory. */
export function ModelMenu(props: {
    liveModel?: LiveModelDocument;
}) {
    return (
        <AppMenu disabled={props.liveModel === undefined}>
            <Show when={props.liveModel}>
                {(liveModel) => <ModelMenuItems liveModel={liveModel()} />}
            </Show>
        </AppMenu>
    );
}

/** Menu items for a model. */
export function ModelMenuItems(props: {
    liveModel: LiveModelDocument;
}) {
    const api = useApi();
    const navigate = useNavigate();

    const onNewDiagram = async (modelRefId: string) => {
        const newRef = await createDiagram(api, modelRefId);
        navigate(`/diagram/${newRef}`);
    };

    const onNewAnalysis = async (modelRefId: string) => {
        const newRef = await createAnalysis("model", modelRefId, api);
        navigate(`/analysis/${newRef}`);
    };

    const onDuplicateModel = async (model: ModelDocument) => {
        const newRef = await createModel(api, {
            ...model,
            name: `${model.name} (copy)`,
        });
        navigate(`/model/${newRef}`);
    };

    return (
        <>
            <NewModelItem />
            <Show when={props.liveModel.theory().supportsInstances}>
                <MenuItem onSelect={() => onNewDiagram(props.liveModel.refId)}>
                    <Network />
                    <MenuItemLabel>{"New diagram in this model"}</MenuItemLabel>
                </MenuItem>
            </Show>
            <MenuItem onSelect={() => onNewAnalysis(props.liveModel.refId)}>
                <ChartSpline />
                <MenuItemLabel>{"New analysis of this model"}</MenuItemLabel>
            </MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={() => onDuplicateModel(props.liveModel.liveDoc.doc)}>
                <Copy />
                <MenuItemLabel>{"Duplicate model"}</MenuItemLabel>
            </MenuItem>
        </>
    );
}
