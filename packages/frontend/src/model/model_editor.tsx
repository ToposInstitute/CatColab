import { MultiProvider } from "@solid-primitives/context";
import { useNavigate, useParams } from "@solidjs/router";
import { Match, Show, Switch, createResource, useContext } from "solid-js";
import invariant from "tiny-invariant";

import type { JsonValue } from "catcolab-api";
import { newAnalysisDocument } from "../analysis/document";
import { RepoContext, RpcContext, getReactiveDoc } from "../api";
import { IconButton, InlineInput } from "../components";
import {
    type CellConstructor,
    type FormalCellEditorProps,
    NotebookEditor,
    cellShortcutModifier,
    newFormalCell,
} from "../notebook";
import { BrandedToolbar, HelpButton } from "../page";
import { TheoryLibraryContext } from "../stdlib";
import type { Theory } from "../theory";
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

import ChartNetwork from "lucide-solid/icons/chart-network";

export default function ModelPage() {
    const params = useParams();
    const refId = params.ref;
    invariant(refId, "Must provide model ref as parameter to model page");

    const rpc = useContext(RpcContext);
    const repo = useContext(RepoContext);
    const theories = useContext(TheoryLibraryContext);
    invariant(rpc && repo && theories, "Missing context for model page");

    const [liveDoc] = createResource<LiveModelDocument>(async () => {
        const reactiveDoc = await getReactiveDoc<ModelDocument>(rpc, repo, refId);
        return enlivenModelDocument(refId, reactiveDoc, theories);
    });

    return <Show when={liveDoc()}>{(liveDoc) => <ModelDocumentEditor liveDoc={liveDoc()} />}</Show>;
}

export function ModelDocumentEditor(props: {
    liveDoc: LiveModelDocument;
}) {
    const rpc = useContext(RpcContext);
    invariant(rpc, "Missing context for model document editor");

    const navigate = useNavigate();

    const createAnalysis = async () => {
        const init = newAnalysisDocument(props.liveDoc.refId);

        const result = await rpc.new_ref.mutate({
            content: init as JsonValue,
            permissions: {
                anyone: "Read",
            },
        });
        invariant(result.tag === "Ok", "Failed to create analysis");
        const newRef = result.content;

        navigate(`/analysis/${newRef}`);
    };

    return (
        <div class="growable-container">
            <BrandedToolbar>
                <HelpButton />
                <PermissionsButton permissions={props.liveDoc.permissions} />
                <IconButton onClick={createAnalysis} tooltip="Analyze this model">
                    <ChartNetwork />
                </IconButton>
            </BrandedToolbar>
            <ModelPane liveDoc={props.liveDoc} />
        </div>
    );
}

export function ModelPane(props: {
    liveDoc: LiveModelDocument;
}) {
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Library of theories should be provided as context");

    const liveDoc = () => props.liveDoc;
    const doc = () => props.liveDoc.doc;
    const changeDoc = (f: (doc: ModelDocument) => void) => props.liveDoc.changeDoc(f);
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
                    theory={props.liveDoc.theory()}
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
                    [TheoryContext, liveDoc().theory],
                    [ObjectIndexContext, liveDoc().objectIndex],
                    [MorphismIndexContext, liveDoc().morphismIndex],
                    [ModelValidationContext, liveDoc().validationResult],
                ]}
            >
                <NotebookEditor
                    handle={props.liveDoc.docHandle}
                    path={["notebook"]}
                    notebook={doc().notebook}
                    changeNotebook={(f) => {
                        changeDoc((doc) => f(doc.notebook));
                    }}
                    formalCellEditor={ModelCellEditor}
                    cellConstructors={modelCellConstructors(liveDoc().theory())}
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

function modelCellConstructors(theory?: Theory): CellConstructor<ModelJudgment>[] {
    return (theory?.types ?? []).map((typ) => {
        const { name, description, shortcut } = typ;
        return {
            name,
            description,
            shortcut: shortcut && [cellShortcutModifier, ...shortcut],
            construct:
                typ.tag === "ObType"
                    ? () => newFormalCell(newObjectDecl(typ.obType))
                    : () => newFormalCell(newMorphismDecl(typ.morType)),
        };
    });
}

function judgmentLabel(judgment: ModelJudgment): string | undefined {
    const theory = useContext(TheoryContext);
    if (judgment.tag === "object") {
        return theory?.()?.getObTypeMeta(judgment.obType)?.name;
    }
    if (judgment.tag === "morphism") {
        return theory?.()?.getMorTypeMeta(judgment.morType)?.name;
    }
}
