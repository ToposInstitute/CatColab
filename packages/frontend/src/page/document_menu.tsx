import { Match, Switch } from "solid-js";
import Ellipsis from "lucide-solid/icons/ellipsis";
import CopyToClipboard from "lucide-solid/icons/clipboard-copy";
import Copy from "lucide-solid/icons/copy";
import Export from "lucide-solid/icons/download";
import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { useNavigate } from "@solidjs/router";

import { useApi } from "../api";
import { IconButton } from "../components";
import { MenuItem, MenuItemLabel, MenuSeparator } from "../page";
import type { RefStub } from "catcolab-api";
import { createDiagram } from "../diagram";
import { createAnalysis } from "../analysis";
import { DocumentTypeIcon } from "../util/document_type_icon";
import type { StableRef } from "catlog-wasm";

export function DocumentMenu(props: {
    stub: RefStub;
    parentRefId: string | null;
}) {
    const api = useApi();

    const unversionedRef = (refId: string): StableRef => ({
        _id: refId,
        _version: null,
        _server: api.serverHost,
    });
    const navigate = useNavigate();

    const onNewDiagram = async () => {
        const modelRefId = (() => {
            switch (props.stub.typeName) {
                case "diagram":
                    if (!props.parentRefId) {
                        throw "Diagram does not have a parent!";
                    }

                    return props.parentRefId;
                case "model":
                    return props.stub.refId;
                default:
                    throw `Can't create diagram for ${props.stub.typeName}`;
            }
        })();

        const newRef = await createDiagram(api, unversionedRef(modelRefId));
        navigate(`/diagram/${newRef}`);
    };

    const onNewAnalysis = async () => {
        const newRef = await createAnalysis(
            api,
            props.stub.typeName as any,
            unversionedRef(props.stub.refId),
        );
        navigate(`/analysis/${newRef}`);
    };

    const onDownloadJSON = () => {
        //     const doc = props.liveDocument.liveDoc.doc;
        //     downloadJson(JSON.stringify(doc), `${doc.name}.json`);
    };

    const onCopy = () => {
        //     const doc = props.liveDocument.liveDoc.doc;
        //     copyToClipboard(JSON.stringify(doc));
    };

    const onDuplicateDocument = async () => {
        //     switch (props.liveDocument.type) {
        //         case "diagram": {
        //             const diagram = props.liveDocument.liveDoc.doc;
        //             const newRef = await createDiagramFromDocument(api, {
        //                 ...diagram,
        //                 name: `${diagram.name} (copy)`,
        //             });
        //             navigate(`/diagram/${newRef}`);
        //             break;
        //         }
        //         case "model": {
        //             const model = props.liveDocument.liveDoc.doc;
        //             const newRef = await createModel(api, {
        //                 ...model,
        //                 name: `${model.name} (copy)`,
        //             });
        //             navigate(`/model/${newRef}`);
        //             break;
        //         }
        //         default:
        //             assertExhaustive(props.liveDocument);
        //     }
    };

    return (
        <DropdownMenu>
            <DropdownMenu.Trigger as={IconButton}>
                <Ellipsis size={18} />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content class="menu popup">
                    <Switch>
                        <Match
                            when={
                                props.stub.typeName === "model"
                                // TODO: need to return theory with ref stub
                                // && props.liveDocument.theory().supportsInstances
                            }
                        >
                            <MenuItem onSelect={() => onNewDiagram()}>
                                <DocumentTypeIcon documentType="diagram" />
                                <MenuItemLabel>{"New diagram in this model"}</MenuItemLabel>
                            </MenuItem>
                        </Match>
                        <Match when={props.stub.typeName === "diagram"}>
                            <MenuItem onSelect={() => onNewDiagram()}>
                                <DocumentTypeIcon documentType="diagram" />
                                <MenuItemLabel>{"New diagram"}</MenuItemLabel>
                            </MenuItem>
                        </Match>
                    </Switch>
                    <MenuItem onSelect={() => onNewAnalysis()}>
                        <DocumentTypeIcon documentType="analysis" />
                        <MenuItemLabel>{`New analysis of this ${props.stub.typeName}`}</MenuItemLabel>
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem onSelect={() => onDuplicateDocument()}>
                        <Copy />
                        <MenuItemLabel>{`Duplicate ${props.stub.typeName}`}</MenuItemLabel>
                    </MenuItem>
                    <MenuItem onSelect={() => onDownloadJSON()}>
                        <Export />
                        <MenuItemLabel>{`Export ${props.stub.typeName}`}</MenuItemLabel>
                    </MenuItem>
                    <MenuItem onSelect={() => onCopy()}>
                        <CopyToClipboard />
                        <MenuItemLabel>{"Copy to clipboard"}</MenuItemLabel>
                    </MenuItem>
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu>
    );
}
