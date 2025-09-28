import { useNavigate } from "@solidjs/router";
import { Match, Show, Switch } from "solid-js";
import invariant from "tiny-invariant";

import type { StableRef } from "catlog-wasm";
import { createAnalysis } from "../analysis/document";
import { duplicateDoc, useApi } from "../api";
import { type LiveDiagramDocument, createDiagram } from "../diagram/document";
import type { LiveModelDocument } from "../model/document";
import {
    AppMenu,
    ImportMenuItem,
    MenuItem,
    MenuItemLabel,
    MenuSeparator,
    NewModelItem,
} from "../page";
import { copyToClipboard, downloadJson } from "../util/json_export";

import ChartSpline from "lucide-solid/icons/chart-spline";
import CopyToClipboard from "lucide-solid/icons/clipboard-copy";
import Copy from "lucide-solid/icons/copy";
import Export from "lucide-solid/icons/download";
import FilePlus from "lucide-solid/icons/file-plus";
import Network from "lucide-solid/icons/network";

/** Hamburger menu for any model or diagram document. */
export function DocumentMenu(props: {
    liveDocument: LiveModelDocument | LiveDiagramDocument;
}) {
    const api = useApi();
    const navigate = useNavigate();

    const unversionedRef = (refId: string): StableRef => ({
        _id: refId,
        _version: null,
        _server: api.serverHost,
    });

    const onNewDiagram = async () => {
        let modelRefId: string | undefined;
        if (props.liveDocument.type === "diagram") {
            modelRefId = props.liveDocument.liveModel.liveDoc.docRef?.refId;
        } else if (props.liveDocument.type === "model") {
            modelRefId = props.liveDocument.liveDoc.docRef?.refId;
        }
        invariant(modelRefId, "To create diagram, parent model should have a ref ID");

        const newRef = await createDiagram(api, unversionedRef(modelRefId));
        navigate(`/diagram/${newRef}`);
    };

    const onNewAnalysis = async () => {
        const refId = props.liveDocument.liveDoc.docRef?.refId;
        invariant(refId, "To create analysis, parent document should have aa ref ID");

        const newRef = await createAnalysis(api, props.liveDocument.type, unversionedRef(refId));
        navigate(`/analysis/${newRef}`);
    };

    const onDuplicateDocument = async () => {
        const newRef = await duplicateDoc(api, props.liveDocument.liveDoc.doc);
        navigate(`/${props.liveDocument.type}/${newRef}`);
    };

    const onDownloadJSON = () => {
        const doc = props.liveDocument.liveDoc.doc;
        downloadJson(JSON.stringify(doc), `${doc.name}.json`);
    };

    const onCopy = () => {
        const doc = props.liveDocument.liveDoc.doc;
        copyToClipboard(JSON.stringify(doc));
    };

    return (
        <AppMenu>
            <Show when={props.liveDocument.type === "model"}>
                <NewModelItem />
            </Show>
            <Switch>
                <Match
                    when={
                        props.liveDocument.type === "model" &&
                        props.liveDocument.theory()?.supportsInstances
                    }
                >
                    <MenuItem onSelect={() => onNewDiagram()}>
                        <Network />
                        <MenuItemLabel>{"New diagram in this model"}</MenuItemLabel>
                    </MenuItem>
                </Match>
                <Match when={props.liveDocument.type === "diagram"}>
                    <MenuItem onSelect={() => onNewDiagram()}>
                        <FilePlus />
                        <MenuItemLabel>{"New diagram"}</MenuItemLabel>
                    </MenuItem>
                </Match>
            </Switch>
            <MenuItem onSelect={() => onNewAnalysis()}>
                <ChartSpline />
                <MenuItemLabel>{`New analysis of this ${props.liveDocument.type}`}</MenuItemLabel>
            </MenuItem>
            <ImportMenuItem />
            <MenuSeparator />
            <MenuItem onSelect={() => onDuplicateDocument()}>
                <Copy />
                <MenuItemLabel>{`Duplicate ${props.liveDocument.type}`}</MenuItemLabel>
            </MenuItem>
            <MenuItem onSelect={() => onDownloadJSON()}>
                <Export />
                <MenuItemLabel>{`Export ${props.liveDocument.type}`}</MenuItemLabel>
            </MenuItem>
            <MenuItem onSelect={() => onCopy()}>
                <CopyToClipboard />
                <MenuItemLabel>{"Copy to clipboard"}</MenuItemLabel>
            </MenuItem>
        </AppMenu>
    );
}
