import { useParams } from "@solidjs/router";
import { getAuth } from "firebase/auth";
import { useAuth, useFirebaseApp } from "solid-firebase";
import { Match, Show, Switch, createResource, createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";

import {
    type DblTheory,
    type Document,
    ElaborationDatabase,
    type ModelDocumentContent,
    type ModelJudgment,
    type Notebook,
} from "catlaborator";
import { type Api, ApiContext, useApi } from "../api";
import { InlineInput } from "../components";
import {
    type CellConstructor,
    cellShortcutModifier,
    type FormalCellEditorProps,
    newFormalCell,
    NotebookEditor,
} from "../notebook";
import { PermissionsButton } from "../user";
import { LiveModelContext } from "./context";
import { catlaborate, getLiveModel, type LiveModelDocument } from "./document";
import { MorphismCellEditor } from "./morphism_cell_editor";
import { ObjectCellEditor } from "./object_cell_editor";
import { TheorySelectorDialog } from "./theory_selector";
import {
    duplicateModelJudgment,
    type MorphismDecl,
    newMorphismDecl,
    newNotebookDecl,
    newObjectDecl,
    type ObjectDecl,
    type RecordDecl,
} from "./types";

import "./model_editor.css";
import { RecordCellEditor } from "./record_cell_editor";
import { stdTheories, TheoryLibraryContext } from "../stdlib";
import { DocumentBreadcrumbs, DocumentLoadingScreen, DocumentMenu, Toolbar } from "../page";
import { WelcomeOverlay } from "../page/welcome_overlay";

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
                <PermissionsButton
                    permissions={props.liveModel.liveDoc.permissions}
                    refId={props.liveModel.refId}
                />
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
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Library of theories should be provided as context");
    const api = useContext(ApiContext);
    invariant(api, "Api should be provided as context");

    const liveDoc = () => props.liveModel.liveDoc;

    const selectableTheories = () => {
        if (liveDoc().doc.notebook.cells.some((cell) => cell.tag === "formal")) {
            return props.liveModel.theory().inclusions;
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
                    setTheory={(id) => {
                        liveDoc().changeDoc((model) => {
                            model.theory = id;
                        });
                    }}
                    theories={selectableTheories()}
                />
            </div>
            <button
                onClick={async () => {
                    await catlaborate(
                        api,
                        new ElaborationDatabase(),
                        props.liveModel.refId,
                        theories,
                    );
                }}
            >
                Elaborate
            </button>
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
        (props.liveModel.theory().modelTypes ?? [])
            .map(modelCellConstructor)
            .concat(notebookCellConstructor);

    const firebaseApp = useFirebaseApp();
    const auth = useAuth(getAuth(firebaseApp));

    const [isOverlayOpen, setOverlayOpen] = createSignal(
        liveDoc().doc.notebook.cells.length === 0 && auth.data == null,
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

/** Editor for a notebook cell in a model notebook.
 */
function ModelCellEditor(props: FormalCellEditorProps<ModelJudgment>) {
    return (
        <Switch>
            <Match when={props.content.tag === "object"}>
                <ObjectCellEditor
                    object={props.content as ObjectDecl}
                    modifyObject={(f) => props.changeContent((content) => f(content as ObjectDecl))}
                    isActive={props.isActive}
                    actions={props.actions}
                />
            </Match>
            <Match when={props.content.tag === "morphism"}>
                <MorphismCellEditor
                    morphism={props.content as MorphismDecl}
                    modifyMorphism={(f) =>
                        props.changeContent((content) => f(content as MorphismDecl))
                    }
                    isActive={props.isActive}
                    actions={props.actions}
                />
            </Match>
            <Match when={props.content.tag === "record"}>
                <RecordCellEditor
                    record={props.content as RecordDecl}
                    modifyRecord={(f) =>
                        props.changeContent((content) => {
                            f(content as RecordDecl);
                        })
                    }
                    isActive={props.isActive}
                    actions={props.actions}
                />
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

const notebookCellConstructor: CellConstructor<ModelJudgment> = {
    name: "Notebook Cell",
    description: "A cell that imports another notebook",
    construct() {
        return newFormalCell(newNotebookDecl());
    },
};

function judgmentLabel(judgment: ModelJudgment): string | undefined {
    const liveModel = useContext(LiveModelContext);
    invariant(liveModel);
    const theory = liveModel().theory();

    if (judgment.tag === "object") {
        return theory.modelObTypeMeta(judgment.obType)?.name;
    }
    if (judgment.tag === "morphism") {
        return theory.modelMorTypeMeta(judgment.morType)?.name;
    }
}
