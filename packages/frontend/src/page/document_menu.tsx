import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { useNavigate } from "@solidjs/router";
import Ellipsis from "lucide-solid/icons/ellipsis";
import { Match, Switch, createMemo, createResource, createSignal } from "solid-js";
import { useContext } from "solid-js";
import { Show } from "solid-js";
import invariant from "tiny-invariant";

import { IconButton } from "catcolab-ui-components";
import { createAnalysis } from "../analysis";
import { type LiveDoc, useApi } from "../api";
import { createDiagram } from "../diagram";
import {
    CopyJSONMenuItem,
    DeleteMenuItem,
    DuplicateMenuItem,
    ExportJSONMenuItem,
    MenuItem,
    MenuItemLabel,
    MenuSeparator,
} from "../page";
import { TheoryLibraryContext } from "../theory";
import { DocumentTypeIcon } from "./document_type_icon";

export function DocumentMenu(props: {
    liveDoc: LiveDoc;
    onDocumentCreated?: () => void;
}) {
    const api = useApi();

    const navigate = useNavigate();
    const docType = () => props.liveDoc.doc.type;

    const onNewDiagram = async () => {
        let modelRefId: string | undefined;
        switch (props.liveDoc.doc.type) {
            case "diagram":
                modelRefId = props.liveDoc.doc.diagramIn._id;
                invariant(modelRefId, "To create diagram, parent model should have a ref ID");
                break;
            case "model":
                modelRefId = props.liveDoc.docRef?.refId;
                invariant(modelRefId, "To create diagram, model should have a ref ID");
                break;
            default:
                throw `Can't create diagram for ${props.liveDoc.doc.type}`;
        }

        const newRef = await createDiagram(api, api.makeUnversionedRef(modelRefId));
        props.onDocumentCreated?.();
        navigate(`/diagram/${newRef}`);
    };

    const onNewAnalysis = async () => {
        const docRefId = props.liveDoc.docRef?.refId;
        invariant(docRefId, "To create analysis, parent should have a ref ID");

        const docType = props.liveDoc.doc.type;
        invariant(docType !== "analysis", "Analysis cannot be created on other analysis");

        const newRef = await createAnalysis(api, docType, api.makeUnversionedRef(docRefId));
        props.onDocumentCreated?.();
        navigate(`/analysis/${newRef}`);
    };

    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Library of theories should be provided as context");

    const [theory] = createResource(
        () => (props.liveDoc.doc.type === "model" ? props.liveDoc.doc.theory : undefined),
        async (theoryId) => {
            return await theories.get(theoryId);
        },
    );

    const showSeparator = createMemo(() => {
        return (
            theory()?.supportsInstances ||
            docType() === "diagram" ||
            props.liveDoc.doc.type !== "analysis"
        );
    });

    const canDelete = () =>
        props.liveDoc.docRef?.permissions.user === "Own" && !props.liveDoc.docRef?.isDeleted;

    const [isDropdownMenuOpen, setDropdownMenuOpen] = createSignal(false);

    return (
        <DropdownMenu open={isDropdownMenuOpen()} onOpenChange={setDropdownMenuOpen}>
            <DropdownMenu.Trigger as={IconButton}>
                <Ellipsis size={18} />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content class="menu popup">
                    <Switch>
                        <Match when={theory()?.supportsInstances}>
                            <MenuItem onSelect={() => onNewDiagram()}>
                                <DocumentTypeIcon documentType="diagram" />
                                <MenuItemLabel>{"New diagram in this model"}</MenuItemLabel>
                            </MenuItem>
                        </Match>
                        <Match when={docType() === "diagram"}>
                            <MenuItem onSelect={() => onNewDiagram()}>
                                <DocumentTypeIcon documentType="diagram" />
                                <MenuItemLabel>{"New diagram"}</MenuItemLabel>
                            </MenuItem>
                        </Match>
                    </Switch>
                    <Show when={props.liveDoc.doc.type !== "analysis"}>
                        <MenuItem onSelect={() => onNewAnalysis()}>
                            <DocumentTypeIcon documentType="analysis" />
                            <MenuItemLabel>{`New analysis of this ${docType()}`}</MenuItemLabel>
                        </MenuItem>
                    </Show>
                    <Show when={showSeparator()}>
                        <MenuSeparator />
                    </Show>
                    <DuplicateMenuItem doc={props.liveDoc.doc} />
                    <ExportJSONMenuItem doc={props.liveDoc.doc} />
                    <CopyJSONMenuItem doc={props.liveDoc.doc} />
                    <MenuSeparator />
                    <DeleteMenuItem
                        refId={props.liveDoc.docRef?.refId}
                        name={props.liveDoc.doc.name}
                        typeName={props.liveDoc.doc.type}
                        canDelete={canDelete()}
                        // Explicitly closing the menu avoids some strange
                        // conflict between kobalte and corvu. Our UI locks
                        // if we don't close the menu _first_.
                        onBeforeDelete={() => setDropdownMenuOpen(false)}
                    />
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu>
    );
}
