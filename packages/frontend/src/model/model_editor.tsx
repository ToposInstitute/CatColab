import { MultiProvider } from "@solid-primitives/context";
import { useNavigate, useParams } from "@solidjs/router";
import { Match, Show, Switch, createResource, useContext } from "solid-js";
import invariant from "tiny-invariant";

import type { JsonValue } from "catcolab-api";
import { newAnalysisDocument } from "../analysis/document";
import { RepoContext, RpcContext, getLiveDoc } from "../api";
import { IconButton, InlineInput } from "../components";
import { newDiagramDocument } from "../diagram";
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
import { PermissionsButton } from "../user";
import {
    ModelValidationContext,
    MorphismIndexContext,
    ObjectIndexContext,
    TheoryContext,
} from "./context";
import { type LiveModelDocument, type ModelDocument, enlivenModelDocument } from "./document";
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

export default function ModelPage() {
    const params = useParams();
    const refId = params.ref;
    invariant(refId, "Must provide model ref as parameter to model page");

    const rpc = useContext(RpcContext);
    const repo = useContext(RepoContext);
    const theories = useContext(TheoryLibraryContext);
    invariant(rpc && repo && theories, "Missing context for model page");

    const [liveModel] = createResource<LiveModelDocument>(async () => {
        const liveDoc = await getLiveDoc<ModelDocument>(rpc, repo, refId);
        return enlivenModelDocument(refId, liveDoc, theories);
    });

    return (
        <Show when={liveModel()}>
            {(liveModel) => <ModelDocumentEditor liveModel={liveModel()} />}
        </Show>
    );
}

export function ModelDocumentEditor(props: {
    liveModel: LiveModelDocument;
}) {
    const rpc = useContext(RpcContext);
    invariant(rpc, "Missing context for model document editor");

    const navigate = useNavigate();

    const createDiagram = async () => {
        const init = newDiagramDocument(props.liveModel.refId);

        const result = await rpc.new_ref.mutate({
            content: init as JsonValue,
            permissions: {
                anyone: "Read",
            },
        });
        invariant(result.tag === "Ok", "Failed to create a new diagram");
        const newRef = result.content;

        navigate(`/diagram/${newRef}`);
    };

    const createAnalysis = async () => {
        const init = newAnalysisDocument(props.liveModel.refId);

        const result = await rpc.new_ref.mutate({
            content: init as JsonValue,
            permissions: {
                anyone: "Read",
            },
        });
        invariant(result.tag === "Ok", "Failed to create a new analysis");
        const newRef = result.content;

        navigate(`/analysis/${newRef}`);
    };

    return (
        <div class="growable-container">
            <BrandedToolbar>
                <HelpButton />
                <PermissionsButton permissions={props.liveModel.liveDoc.permissions} />
                <Show when={props.liveModel.theory()?.instanceTypes.length}>
                    <IconButton onClick={createDiagram} tooltip="Create a diagram in this model">
                        <Network />
                    </IconButton>
                </Show>
                <IconButton onClick={createAnalysis} tooltip="Analyze this model">
                    <ChartSpline />
                </IconButton>
            </BrandedToolbar>
            <ModelPane liveModel={props.liveModel} />
        </div>
    );
}

export function ModelPane(props: {
    liveModel: LiveModelDocument;
}) {
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Library of theories should be provided as context");

    const liveModel = () => props.liveModel;
    const doc = () => props.liveModel.liveDoc.doc;
    const changeDoc = (f: (doc: ModelDocument) => void) => props.liveModel.liveDoc.changeDoc(f);
    return (
        <div class="notebook-container">
            <div class="model-head">
                <div class="model-title">
                    <InlineInput
                        text={doc().name}
                        setText={(text) => {
                            changeDoc((doc) => {
                                doc.name = text;
                            });
                        }}
                        placeholder="Untitled"
                    />
                </div>
                <TheorySelectorDialog
                    theory={props.liveModel.theory()}
                    setTheory={(id) => {
                        changeDoc((model) => {
                            model.theory = id;
                        });
                    }}
                    theories={theories}
                    disabled={doc().notebook.cells.some((cell) => cell.tag === "formal")}
                />
            </div>
            <MultiProvider
                values={[
                    [TheoryContext, liveModel().theory],
                    [ObjectIndexContext, liveModel().objectIndex],
                    [MorphismIndexContext, liveModel().morphismIndex],
                    [ModelValidationContext, liveModel().validationResult],
                ]}
            >
                <NotebookEditor
                    handle={liveModel().liveDoc.docHandle}
                    path={["notebook"]}
                    notebook={doc().notebook}
                    changeNotebook={(f) => {
                        changeDoc((doc) => f(doc.notebook));
                    }}
                    formalCellEditor={ModelCellEditor}
                    cellConstructors={modelCellConstructors(liveModel().theory()?.modelTypes ?? [])}
                    cellLabel={judgmentLabel}
                />
            </MultiProvider>
        </div>
    );
}

/** Editor for a cell in a model of a double theory.
 */
export function ModelCellEditor(props: FormalCellEditorProps<ModelJudgment>) {
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

function modelCellConstructors(modelTypes: ModelTypeMeta[]): CellConstructor<ModelJudgment>[] {
    return modelTypes.map((meta) => {
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
    });
}

function judgmentLabel(judgment: ModelJudgment): string | undefined {
    const theory = useContext(TheoryContext);
    if (judgment.tag === "object") {
        return theory?.()?.modelObTypeMeta(judgment.obType)?.name;
    }
    if (judgment.tag === "morphism") {
        return theory?.()?.modelMorTypeMeta(judgment.morType)?.name;
    }
}
