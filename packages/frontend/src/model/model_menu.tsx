import { useNavigate } from "@solidjs/router";
import { Show } from "solid-js";

import { createAnalysis } from "../analysis/document";
import { type StableRef, useApi } from "../api";
import { createDiagram } from "../diagram/document";
import { AppMenu, MenuItem, MenuItemLabel, MenuSeparator } from "../page";
import { copyToClipboard, downloadJson } from "../util/json_export";
import { type LiveModelDocument, type ModelDocument, createModel } from "./document";

<<<<<<< HEAD
import ChartSpline from "lucide-solid/icons/chart-spline";
import Copy from "lucide-solid/icons/copy";
import Network from "lucide-solid/icons/network";
=======
import { ChartSpline, ClipboardCopy, Copy, Download, FilePlus, Network } from "lucide-solid";
>>>>>>> 8dd5942 (Fix icons)

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

    const unversionedRef = (refId: string): StableRef => ({
        _id: refId,
        _version: null,
        _server: api.serverHost,
    });

    const onNewDiagram = async (modelRefId: string) => {
        const newRef = await createDiagram(api, unversionedRef(modelRefId));
        navigate(`/diagram/${newRef}`);
    };

    const onNewAnalysis = async (modelRefId: string) => {
        const newRef = await createAnalysis(api, "model", unversionedRef(modelRefId));
        navigate(`/analysis/${newRef}`);
    };

    const onDuplicateModel = async (model: ModelDocument) => {
        const newRef = await createModel(api, {
            ...model,
            name: `${model.name} (copy)`,
        });
        navigate(`/model/${newRef}`);
    };
    const onDownloadJSON = (model: ModelDocument) => {
        downloadJson({ data: JSON.stringify(model), filename: `${model.name}.json` });
    };
    const onCopy = (model: ModelDocument) => {
        copyToClipboard({ data: JSON.stringify(model) });
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
            <MenuItem onSelect={() => onDownloadJSON(props.liveModel.liveDoc.doc)}>
                <Download />
                <MenuItemLabel>{"Download JSON"}</MenuItemLabel>
            </MenuItem>
            <MenuItem onSelect={() => onCopy(props.liveModel.liveDoc.doc)}>
                <ClipboardCopy />
                <MenuItemLabel>{"Copy to clipboard"}</MenuItemLabel>
            </MenuItem>
        </>
    );
}
