import Popover from "@corvu/popover";
import { useNavigate } from "@solidjs/router";
import Ellipsis from "lucide-solid/icons/ellipsis";
import { createMemo, createResource, Match, Show, Switch, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { DocumentTypeIcon, IconButton } from "catcolab-ui-components";
import { createAnalysis } from "../analysis";
import { type DocRef, type DocumentType, type LiveDoc, useApi } from "../api";
import { createDiagram } from "../diagram";
import {
    CopyJSONMenuItem,
    DeleteMenuItem,
    DuplicateMenuItem,
    ExportJSONMenuItem,
    MenuItem,
    MenuItemLabel,
    MenuSeparator,
    RestoreMenuItem,
} from "../page";
import { TheoryLibraryContext } from "../theory";

export function DocumentMenu(props: {
    liveDoc: LiveDoc;
    docRef: DocRef;
    onDocCreated?: (docType: DocumentType, refId: string) => void;
    onDocDeleted?: () => void;
}) {
    const api = useApi();

    const navigate = useNavigate();
    const docType = () => props.liveDoc.doc.type;

    const handleDocCreated = (docType: DocumentType, refId: string) => {
        if (props.onDocCreated) {
            props.onDocCreated(docType, refId);
        } else {
            navigate(`/${docType}/${refId}`);
        }
    };

    const onNewDiagram = async () => {
        let modelRefId: string | undefined;
        switch (props.liveDoc.doc.type) {
            case "diagram":
                modelRefId = props.liveDoc.doc.diagramIn._id;
                invariant(modelRefId, "To create diagram, parent model should have a ref ID");
                break;
            case "model":
                modelRefId = props.docRef.refId;
                break;
            default:
                throw `Can't create diagram for ${props.liveDoc.doc.type}`;
        }

        const newRef = await createDiagram(api, api.makeUnversionedRef(modelRefId));
        handleDocCreated("diagram", newRef);
    };

    const onNewAnalysis = async () => {
        const docRefId = props.docRef.refId;
        const docType = props.liveDoc.doc.type;
        invariant(docType !== "analysis", "Analysis cannot be created on other analysis");

        const newRef = await createAnalysis(api, docType, api.makeUnversionedRef(docRefId));
        handleDocCreated("analysis", newRef);
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
    const canDelete = () => props.docRef.permissions.user === "Own" && !props.docRef.isDeleted;

    const canRestore = () => props.docRef.permissions.user === "Own" && props.docRef.isDeleted;
    return (
        <Popover
            placement="bottom-end"
            floatingOptions={{
                offset: 4,
                flip: true,
                shift: true,
            }}
        >
            <Popover.Trigger as={IconButton}>
                <Ellipsis size={18} />
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content class="menu popup">
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
                    <Switch>
                        <Match when={canRestore()}>
                            <RestoreMenuItem
                                refId={props.docRef.refId}
                                typeName={props.liveDoc.doc.type}
                                onRestored={props.onDocDeleted}
                            />
                        </Match>
                        <Match when={true}>
                            <DeleteMenuItem
                                refId={props.docRef.refId}
                                name={props.liveDoc.doc.name}
                                typeName={props.liveDoc.doc.type}
                                canDelete={canDelete()}
                                onDeleted={props.onDocDeleted}
                            />
                        </Match>
                    </Switch>
                </Popover.Content>
            </Popover.Portal>
        </Popover>
    );
}
