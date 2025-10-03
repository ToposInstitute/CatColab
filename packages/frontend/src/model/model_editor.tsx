import { useParams } from "@solidjs/router";
import { getAuth } from "firebase/auth";
import { useAuth, useFirebaseApp } from "solid-firebase";
import { Match, Show, Switch, createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";

import type { InstantiatedModel, ModelJudgment, MorDecl, ObDecl } from "catlog-wasm";
import { useApi } from "../api";
import { InlineInput } from "../components";
import {
    type CellConstructor,
    type FormalCellEditorProps,
    NotebookEditor,
    NotebookUtils,
    newFormalCell,
} from "../notebook";
import { DocumentBreadcrumbs, DocumentLoadingScreen, Toolbar } from "../page";
import { WelcomeOverlay } from "../page/welcome_overlay";
import { stdTheories } from "../stdlib";
import { type ModelTypeMeta, TheoryLibraryContext } from "../theory";
import { TheorySelectorDialog } from "../theory/theory_selector";
import { PermissionsButton } from "../user";
import { LiveModelContext } from "./context";
import { type LiveModelDocument, migrateModelDocument } from "./document";
import { InstantiationCellEditor } from "./instantiation_cell_editor";
import { createModelLibraryWithApi } from "./model_library";
import { ModelMenu } from "./model_menu";
import { MorphismCellEditor } from "./morphism_cell_editor";
import { ObjectCellEditor } from "./object_cell_editor";
import {
    duplicateModelJudgment,
    newInstantiatedModel,
    newMorphismDecl,
    newObjectDecl,
} from "./types";

import "./model_editor.css";

export default function ModelPage() {
    const params = useParams();

    const api = useApi();
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Must provide theory library as context to model page");
    const models = createModelLibraryWithApi(api, theories);

    const liveModel = models.useLiveModel(() => params.ref);

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
                <ModelMenu liveModel={props.liveModel} />
                <DocumentBreadcrumbs liveDoc={props.liveModel.liveDoc} />
                <span class="filler" />
                <PermissionsButton liveDoc={props.liveModel.liveDoc} />
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
                    setTheory={(id) => migrateModelDocument(props.liveModel, id, stdTheories)}
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

    const cellConstructors = (): CellConstructor<ModelJudgment>[] => [
        {
            name: "Instantiate",
            description: "Instantiate an existing model into this one",
            shortcut: ["I"],
            construct() {
                return newFormalCell(newInstantiatedModel());
            },
        },
        ...(props.liveModel.theory()?.modelTypes ?? []).map(modelCellConstructor),
    ];

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
                        object={props.content as ObDecl}
                        modifyObject={(f) => props.changeContent((content) => f(content as ObDecl))}
                        isActive={props.isActive}
                        actions={props.actions}
                        theory={theory()}
                    />
                )}
            </Match>
            <Match when={props.content.tag === "morphism" && liveModel().theory()}>
                {(theory) => (
                    <MorphismCellEditor
                        morphism={props.content as MorDecl}
                        modifyMorphism={(f) =>
                            props.changeContent((content) => f(content as MorDecl))
                        }
                        isActive={props.isActive}
                        actions={props.actions}
                        theory={theory()}
                    />
                )}
            </Match>
            <Match when={props.content.tag === "instantiation"}>
                <InstantiationCellEditor
                    instantiation={props.content as InstantiatedModel}
                    modifyInstantiation={(f) =>
                        props.changeContent((content) => f(content as InstantiatedModel))
                    }
                    isActive={props.isActive}
                    actions={props.actions}
                />
            </Match>
        </Switch>
    );
}

function modelCellConstructor(meta: ModelTypeMeta): CellConstructor<ModelJudgment> {
    const { tag, name, description, shortcut } = meta;
    return {
        name,
        description,
        shortcut,
        construct() {
            switch (tag) {
                case "ObType":
                    return newFormalCell(newObjectDecl(meta.obType));
                case "MorType":
                    return newFormalCell(newMorphismDecl(meta.morType));
                default:
                    throw tag satisfies never;
            }
        },
    };
}

function judgmentLabel(judgment: ModelJudgment): string | undefined {
    const liveModel = useContext(LiveModelContext);
    invariant(liveModel);
    const theory = liveModel().theory();

    switch (judgment.tag) {
        case "object":
            return theory?.modelObTypeMeta(judgment.obType)?.name;
        case "morphism":
            return theory?.modelMorTypeMeta(judgment.morType)?.name;
        case "instantiation":
            return theory?.name;
        default:
            judgment satisfies never;
    }
}
