import { useNavigate } from "@solidjs/router";
import { Match, Show, Switch } from "solid-js";

import { createAnalysis } from "../analysis/document";
import { type StableRef, useApi } from "../api";
import {
    type LiveDiagramDocument,
    createDiagram,
    createDiagramFromDocument,
} from "../diagram/document";
import { type LiveModelDocument, createModel } from "../model/document";
import { AppMenu, MenuItem, MenuItemLabel, MenuSeparator, NewModelItem } from "../page";
import { copyToClipboard, downloadJson } from "../util/json_export";

import ChartSpline from "lucide-solid/icons/chart-spline";
import CopyToClipboard from "lucide-solid/icons/clipboard-copy";
import Copy from "lucide-solid/icons/copy";
import Export from "lucide-solid/icons/download";
import FilePlus from "lucide-solid/icons/file-plus";
import Network from "lucide-solid/icons/network";
import { assertExhaustive } from "../util/assert_exhaustive";

/** Hamburger menu for a diagram in a model. */
export function LiveDocumentMenu(props: {
    liveDocument?: LiveDiagramDocument | LiveModelDocument;
}) {
    return (
        <AppMenu disabled={props.liveDocument === undefined}>
            <Show when={props.liveDocument}>
                {(liveDocument) => <LiveDocumentMenuItems liveDocument={liveDocument()} />}
            </Show>
        </AppMenu>
    );
}

/** Menu items for any live document. */
export function LiveDocumentMenuItems(props: {
    liveDocument: LiveDiagramDocument | LiveModelDocument;
}) {
    const api = useApi();
    const navigate = useNavigate();

    const unversionedRef = (refId: string): StableRef => ({
        _id: refId,
        _version: null,
        _server: api.serverHost,
    });

    const onNewDiagram = async () => {
        const modelRefId = (() => {
            switch (props.liveDocument.type) {
                case "diagram":
                    return props.liveDocument.liveModel.refId;
                case "model":
                    return props.liveDocument.refId;
                default:
                    assertExhaustive(props.liveDocument);
            }
        })();

        const newRef = await createDiagram(api, unversionedRef(modelRefId));
        navigate(`/diagram/${newRef}`);
    };

    const onNewAnalysis = async () => {
        const newRef = await createAnalysis(
            api,
            props.liveDocument.type,
            unversionedRef(props.liveDocument.refId),
        );
        navigate(`/analysis/${newRef}`);
    };

    const onDuplicateDocument = async () => {
        switch (props.liveDocument.type) {
            case "diagram": {
                const diagram = props.liveDocument.liveDoc.doc;
                const newRef = await createDiagramFromDocument(api, {
                    ...diagram,
                    name: `${diagram.name} (copy)`,
                });
                navigate(`/diagram/${newRef}`);
                break;
            }
            case "model": {
                const model = props.liveDocument.liveDoc.doc;
                const newRef = await createModel(api, {
                    ...model,
                    name: `${model.name} (copy)`,
                });
                navigate(`/model/${newRef}`);
                break;
            }
            default:
                assertExhaustive(props.liveDocument);
        }
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
        <>
            <Show when={props.liveDocument.type === "model"}>
                <NewModelItem />
            </Show>
            <Switch>
                <Match
                    when={
                        props.liveDocument.type === "model" &&
                        props.liveDocument.theory().supportsInstances
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
            <MenuSeparator />
            <MenuItem onSelect={() => onDuplicateDocument()}>
                <Copy />
                <MenuItemLabel>{`Duplicate ${props.liveDocument.type}`}</MenuItemLabel>
            </MenuItem>
            <MenuItem onSelect={() => onDownloadJSON()}>
                <Export />
                <MenuItemLabel>{"Export notebook"}</MenuItemLabel>
            </MenuItem>
            <MenuItem onSelect={() => onCopy()}>
                <CopyToClipboard />
                <MenuItemLabel>{"Copy to clipboard"}</MenuItemLabel>
            </MenuItem>
        </>
    );
}
