import { useNavigate } from "@solidjs/router";
import { Show } from "solid-js";
import invariant from "tiny-invariant";

import { createAnalysis } from "../analysis/document";
import { useApi } from "../api";
import { createDiagram } from "../diagram/document";
import {
    AppMenu,
    CopyJSONMenuItem,
    DuplicateMenuItem,
    ExportJSONMenuItem,
    ImportMenuItem,
    MenuItem,
    MenuItemLabel,
    MenuSeparator,
    NewModelItem,
} from "../page";
import type { LiveModelDocument } from "./document";

import ChartSpline from "lucide-solid/icons/chart-spline";
import Network from "lucide-solid/icons/network";

/** Hamburger menu for a model or document. */
export function ModelMenu(props: {
    liveModel: LiveModelDocument;
}) {
    const api = useApi();
    const navigate = useNavigate();

    const liveDoc = () => props.liveModel.liveDoc;

    const onNewDiagram = async () => {
        const modelRefId = liveDoc().docRef?.refId;
        invariant(modelRefId, "To create diagram, parent model should have a ref ID");

        const newRef = await createDiagram(api, api.makeUnversionedRef(modelRefId));
        navigate(`/diagram/${newRef}`);
    };

    const onNewAnalysis = async () => {
        const refId = liveDoc().docRef?.refId;
        invariant(refId, "To create analysis, parent model should have a ref ID");

        const newRef = await createAnalysis(api, "model", api.makeUnversionedRef(refId));
        navigate(`/analysis/${newRef}`);
    };

    return (
        <AppMenu>
            <NewModelItem />
            <Show when={props.liveModel.theory()?.supportsInstances}>
                <MenuItem onSelect={onNewDiagram}>
                    <Network />
                    <MenuItemLabel>{"New diagram in this model"}</MenuItemLabel>
                </MenuItem>
            </Show>
            <MenuItem onSelect={onNewAnalysis}>
                <ChartSpline />
                <MenuItemLabel>{"New analysis of this model"}</MenuItemLabel>
            </MenuItem>
            <ImportMenuItem />
            <MenuSeparator />
            <DuplicateMenuItem doc={liveDoc().doc} />
            <ExportJSONMenuItem doc={liveDoc().doc} />
            <CopyJSONMenuItem doc={liveDoc().doc} />
        </AppMenu>
    );
}
