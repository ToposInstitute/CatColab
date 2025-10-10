import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { useNavigate } from "@solidjs/router";
import Copy from "lucide-solid/icons/copy";
import Ellipsis from "lucide-solid/icons/ellipsis";
import { Match, Switch } from "solid-js";

import type { RefStub } from "catcolab-api";
import { createAnalysis } from "../analysis";
import { Api, duplicateDoc, makeUnversionedRef, useApi } from "../api";
import { IconButton } from "../components";
import { createDiagram } from "../diagram";
import {
    CopyJSONMenuItem,
    DuplicateMenuItem,
    ExportJSONMenuItem,
    MenuItem,
    MenuItemLabel,
    MenuSeparator,
} from "../page";
import { DocumentTypeIcon } from "../util/document_type_icon";

export function DocumentMenu(props: {
    stub: RefStub;
    parentRefId: string | null;
}) {
    const api = useApi();

    const navigate = useNavigate();

    const onNewDiagram = async () => {
        let modelRefId: string | undefined;
        switch (props.stub.typeName) {
            case "diagram":
                if (!props.parentRefId) {
                    throw "Diagram does not have a parent!";
                }

                modelRefId = props.parentRefId;
                break;
            case "model":
                modelRefId = props.stub.refId;
                break;
            default:
                throw `Can't create diagram for ${props.stub.typeName}`;
        }

        const newRef = await createDiagram(api, makeUnversionedRef(api, modelRefId));
        navigate(`/diagram/${newRef}`);
    };

    const onNewAnalysis = async () => {
        const newRef = await createAnalysis(
            api,
            "diagram",
            makeUnversionedRef(api, props.stub.refId),
        );
        navigate(`/analysis/${newRef}`);
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
                                // TODO: refStub needs to have a theory field in order to check if it supports the diagram instance
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
                    <DuplicateMenuItem stub={props.stub} />
                    <ExportJSONMenuItem stub={props.stub} />
                    <CopyJSONMenuItem stub={props.stub} />
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu>
    );
}
