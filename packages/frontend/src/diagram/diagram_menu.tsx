import { useNavigate } from "@solidjs/router";
import { Show } from "solid-js";

import { createAnalysis } from "../analysis/document";
import { type StableRef, useApi } from "../api";
import { AppMenu, MenuItem, MenuItemLabel, MenuSeparator } from "../page";
import {
    type DiagramDocument,
    type LiveDiagramDocument,
    createDiagram,
    createDiagramFromDocument,
} from "./document";

import { copyToClipboard, downloadJson } from "../util/json_export";

import ChartSpline from "lucide-solid/icons/chart-spline";
import Copy from "lucide-solid/icons/copy";
import FilePlus from "lucide-solid/icons/file-plus";

/** Hamburger menu for a diagram in a model. */
export function DiagramMenu(props: {
    liveDiagram?: LiveDiagramDocument;
}) {
    return (
        <AppMenu disabled={props.liveDiagram === undefined}>
            <Show when={props.liveDiagram}>
                {(liveDiagram) => <DiagramMenuItems liveDiagram={liveDiagram()} />}
            </Show>
        </AppMenu>
    );
}

/** Menu items for a diagram in a model. */
export function DiagramMenuItems(props: {
    liveDiagram: LiveDiagramDocument;
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

    const onNewAnalysis = async (diagramRefId: string) => {
        const newRef = await createAnalysis(api, "diagram", unversionedRef(diagramRefId));
        navigate(`/analysis/${newRef}`);
    };

    const onDuplicateDiagram = async (diagram: DiagramDocument) => {
        const newRef = await createDiagramFromDocument(api, {
            ...diagram,
            name: `${diagram.name} (copy)`,
        });
        navigate(`/diagram/${newRef}`);
    };

    //Can this be less repetitive?
    const onDownloadJSON = (diagram: DiagramDocument) => {
        downloadJson({ data: JSON.stringify(diagram), filename: `${diagram.name}.json` });
    };
    const onCopy = (diagram: DiagramDocument) => {
        copyToClipboard({ data: JSON.stringify(diagram) });
    };
    return (
        <>
            <MenuItem onSelect={() => onNewDiagram(props.liveDiagram.liveModel.refId)}>
                <FilePlus />
                <MenuItemLabel>{"New diagram"}</MenuItemLabel>
            </MenuItem>
            <MenuItem onSelect={() => onNewAnalysis(props.liveDiagram.refId)}>
                <ChartSpline />
                <MenuItemLabel>{"New analysis of this diagram"}</MenuItemLabel>
            </MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={() => onDuplicateDiagram(props.liveDiagram.liveDoc.doc)}>
                <Copy />
                <MenuItemLabel>{"Duplicate diagram"}</MenuItemLabel>
            </MenuItem>
            <MenuItem onSelect={() => onDownloadJSON(props.liveDiagram.liveDoc.doc)}>
                <Copy />
                <MenuItemLabel>{"Download JSON"}</MenuItemLabel>
            </MenuItem>
            <MenuItem onSelect={() => onCopy(props.liveDiagram.liveDoc.doc)}>
                <Copy />
                <MenuItemLabel>{"Copy to clipboard"}</MenuItemLabel>
            </MenuItem>
        </>
    );
}
