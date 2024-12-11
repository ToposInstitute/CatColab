import { useNavigate, useParams } from "@solidjs/router";
import { Match, Show, Switch, createResource, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { createAnalysis } from "../analysis/document";
import { useApi } from "../api";
import { IconButton, InlineInput } from "../components";
import { createDiagram } from "../diagram/document";
import {
    type CellConstructor,
    type FormalCellEditorProps,
    NotebookEditor,
    cellShortcutModifier,
    newFormalCell,
} from "../notebook";
import { BrandedToolbar, HelpButton } from "../page";
import { TheoryLibraryContext } from "../stdlib";
import type { ModelTypeMeta } from "../theory";
import { MaybePermissionsButton } from "../user";
import { LiveModelContext } from "./context";
import { type LiveModelDocument, getLiveModel } from "./document";
import { MorphismCellEditor } from "./morphism_cell_editor";
import { ObjectCellEditor } from "./object_cell_editor";
import { TheorySelectorDialog } from "./theory_selector";
import {
    type ModelJudgment,
    type MorphismDecl,
    type ObjectDecl,
    newMorphismDecl,
    newObjectDecl,
} from "./types";

import "./model_editor.css";

import ChartSpline from "lucide-solid/icons/chart-spline";
import Network from "lucide-solid/icons/network";
import { sharingLink, sharingLinkPopup } from './share_model';
import { Copy, Link2 } from "lucide-solid";

export default function ModelPage() {
    const params = useParams();
    const refId = params.ref;
    invariant(refId, "Must provide model ref as parameter to model page");

    const api = useApi();
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Must provide theory library as context to model page");

    const [liveModel] = createResource(() => getLiveModel(refId, api, theories));

    return <ModelDocumentEditor liveModel={liveModel()} />;
}

export function ModelDocumentEditor(props: {
    liveModel?: LiveModelDocument;
}) {
    const api = useApi();
    const navigate = useNavigate();

    const onCreateDiagram = async (modelRefId: string) => {
        const newRef = await createDiagram(modelRefId, api);
        navigate(`/diagram/${newRef}`);
    };

    const onCreateAnalysis = async (modelRefId: string) => {
        const newRef = await createAnalysis("model", modelRefId, api);
        navigate(`/analysis/${newRef}`);
    };

    return (
        <div class="growable-container">

            <BrandedToolbar>
                <HelpButton />
                <IconButton onClick={() => sharingLinkPopup({sharingLink: sharingLink})} tooltip="Share model">
                <Link2  />
                </IconButton>
                <MaybePermissionsButton permissions={props.liveModel?.liveDoc.permissions} />
                <Show when={props.liveModel?.theory()?.supportsInstances}>
                    <IconButton
                        onClick={() => props.liveModel && onCreateDiagram(props.liveModel.refId)}
                        tooltip="Create a diagram in this model"
                    >
                        <Network />
                    </IconButton>
                </Show>
                <IconButton
                    onClick={() => props.liveModel && onCreateAnalysis(props.liveModel.refId)}
                    tooltip="Analyze this model"
                >
                    <ChartSpline />
                </IconButton>
            </BrandedToolbar>
            <Show when={props.liveModel}>
                {(liveModel) => <ModelPane liveModel={liveModel()} />}
            </Show>
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

    const liveDoc = () => props.liveModel.liveDoc;

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
                    theory={props.liveModel.theory()}
                    setTheory={(id) => {
                        liveDoc().changeDoc((model) => {
                            model.theory = id;
                        });
                    }}
                    theories={theories}
                    disabled={liveDoc().doc.notebook.cells.some((cell) => cell.tag === "formal")}
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

    return (
        <LiveModelContext.Provider value={props.liveModel}>
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
    const theory = liveModel?.theory();
    if (judgment.tag === "object") {
        return theory?.modelObTypeMeta(judgment.obType)?.name;
    }
    if (judgment.tag === "morphism") {
        return theory?.modelMorTypeMeta(judgment.morType)?.name;
    }
}



