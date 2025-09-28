import { useParams } from "@solidjs/router";
import { getAuth } from "firebase/auth";
import { useAuth, useFirebaseApp } from "solid-firebase";
import { Match, Show, Switch, createResource, createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";

import type { ModelJudgment } from "catlog-wasm";
import { useApi } from "../api";
import { InlineInput } from "../components";
import {
    type CellConstructor,
    type FormalCellEditorProps,
    NotebookEditor,
    NotebookUtils,
    cellShortcutModifier,
    newFormalCell,
} from "../notebook";
import { DocumentBreadcrumbs, DocumentLoadingScreen, DocumentMenu, Toolbar } from "../page";
import { WelcomeOverlay } from "../page/welcome_overlay";
import { TheoryLibraryContext, stdTheories } from "../stdlib";
import type { ModelTypeMeta } from "../theory";
import { PermissionsButton } from "../user";
import { LiveModelContext } from "./context";
import { type LiveModelDocument, getLiveModel, migrateModelDocument } from "./document";
import { MorphismCellEditor } from "./morphism_cell_editor";
import { ObjectCellEditor } from "./object_cell_editor";
import { TheorySelectorDialog } from "./theory_selector";
import {
    type MorphismDecl,
    type ObjectDecl,
    duplicateModelJudgment,
    newMorphismDecl,
    newObjectDecl,
} from "./types";

import "./model_editor.css";

export default function ModelPage() {
    const api = useApi();
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Must provide theory library as context to model page");

    const params = useParams();

    const [liveModel] = createResource(
        () => params.ref,
        (refId) => getLiveModel(refId, api, theories),
    );

    return (
        <Show when={liveModel()} fallback={<DocumentLoadingScreen />}>
            {(loadedModel) => <ModelDocumentEditor liveModel={loadedModel()} />}
        </Show>
    );
}

export function ModelDocumentEditor(props: {
    liveModel: LiveModelDocument;
}) {
    return (
        <div class="growable-container">
            <Toolbar>
                <DocumentMenu liveDocument={props.liveModel} />
                <DocumentBreadcrumbs document={props.liveModel} />
                <span class="filler" />
                <Show when={props.liveModel.liveDoc.docRef}>
                    {(docRef) => (
                        <PermissionsButton
                            permissions={docRef().permissions}
                            refId={docRef().refId}
                            liveDocument={props.liveModel}
                        />
                    )}
                </Show>
            </Toolbar>
            <ModelPane liveModel={props.liveModel} />
        </div>
    );
}

/** Pane containing a model notebook plus a header with the title and theory.
 */
export function ModelPane(props: {
    liveModel: LiveModelDocument;
}) {
    const liveDoc = () => props.liveModel.liveDoc;

    const selectableTheories = () => {
        if (NotebookUtils.hasFormalCells(liveDoc().doc.notebook)) {
            return props.liveModel.theory()?.migrationTargets ?? [];
        } else {
            // If the model has no formal cells, allow any theory to be selected.
            return undefined;
        }
    };

    return (
        <div class="notebook-container">
            <div class="model-head">
                <div class="title">
                    <InlineInput
                        text={liveDoc().doc.name}
                        setText={(text) => {
                            liveDoc().changeDoc((doc) => {
                                doc.name = text;
                            });
                        }}
                        placeholder="Untitled"
                    />
                </div>
                <TheorySelectorDialog
                    theoryMeta={stdTheories.getMetadata(liveDoc().doc.theory)}
                    setTheory={(id) => migrateModelDocument(liveDoc(), id, stdTheories)}
                    theories={selectableTheories()}
                />
            </div>
            <ModelNotebookEditor liveModel={props.liveModel} />
        </div>
    );
}

/** Notebook editor for a model of a double theory.
 */
export function ModelNotebookEditor(props: {
    liveModel: LiveModelDocument;
}) {
    const liveDoc = () => props.liveModel.liveDoc;

    const cellConstructors = () =>
        (props.liveModel.theory()?.modelTypes ?? []).map(modelCellConstructor);

    const firebaseApp = (() => {
        try {
            return useFirebaseApp();
        } catch {}
    })();
    const auth = firebaseApp && useAuth(getAuth(firebaseApp));

    const [isOverlayOpen, setOverlayOpen] = createSignal(
        liveDoc().doc.notebook.cellOrder.length === 0 && auth != null && auth.data == null,
    );
    const toggleOverlay = () => setOverlayOpen(!isOverlayOpen());

    return (
        <LiveModelContext.Provider value={() => props.liveModel}>
            <WelcomeOverlay isOpen={isOverlayOpen()} onClose={toggleOverlay} />
            <NotebookEditor
                handle={liveDoc().docHandle}
                path={["notebook"]}
                notebook={liveDoc().doc.notebook}
                changeNotebook={(f) => {
                    liveDoc().changeDoc((doc) => f(doc.notebook));
                }}
                formalCellEditor={ModelCellEditor}
                cellConstructors={cellConstructors()}
                cellLabel={judgmentLabel}
                duplicateCell={duplicateModelJudgment}
            />
        </LiveModelContext.Provider>
    );
}

/** Editor for a notebook cell in a model notebook. */
export function ModelCellEditor(props: FormalCellEditorProps<ModelJudgment>) {
    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    return (
        <Switch>
            <Match when={props.content.tag === "object" && liveModel().theory()}>
                {(theory) => (
                    <ObjectCellEditor
                        object={props.content as ObjectDecl}
                        modifyObject={(f) =>
                            props.changeContent((content) => f(content as ObjectDecl))
                        }
                        isActive={props.isActive}
                        actions={props.actions}
                        theory={theory()}
                    />
                )}
            </Match>
            <Match when={props.content.tag === "morphism" && liveModel().theory()}>
                {(theory) => (
                    <MorphismCellEditor
                        morphism={props.content as MorphismDecl}
                        modifyMorphism={(f) =>
                            props.changeContent((content) => f(content as MorphismDecl))
                        }
                        isActive={props.isActive}
                        actions={props.actions}
                        theory={theory()}
                    />
                )}
            </Match>
        </Switch>
    );
}

function modelCellConstructor(meta: ModelTypeMeta): CellConstructor<ModelJudgment> {
    const { name, description, shortcut } = meta;
    return {
        name,
        description,
        shortcut: shortcut && [cellShortcutModifier, ...shortcut],
        construct() {
            return meta.tag === "ObType"
                ? newFormalCell(newObjectDecl(meta.obType))
                : newFormalCell(newMorphismDecl(meta.morType));
        },
    };
}

function judgmentLabel(judgment: ModelJudgment): string | undefined {
    const liveModel = useContext(LiveModelContext);
    invariant(liveModel);
    const theory = liveModel().theory();

    if (judgment.tag === "object") {
        return theory?.modelObTypeMeta(judgment.obType)?.name;
    }
    if (judgment.tag === "morphism") {
        return theory?.modelMorTypeMeta(judgment.morType)?.name;
    }
}
