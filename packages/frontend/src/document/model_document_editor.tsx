import type { ChangeFn, DocHandle } from "@automerge/automerge-repo";
import { MultiProvider } from "@solid-primitives/context";
import { useNavigate, useParams } from "@solidjs/router";
import { type Accessor, Match, Switch, createMemo, createResource, useContext } from "solid-js";
import invariant from "tiny-invariant";

import type { JsonValue, Permissions } from "catcolab-api";
import type { Uuid } from "catlog-wasm";
import { type ReactiveDoc, RepoContext, RpcContext, getReactiveDoc } from "../api";
import { IconButton, InlineInput } from "../components";
import {
    type ModelJudgment,
    ModelValidationContext,
    type ModelValidationResult,
    MorphismCellEditor,
    type MorphismDecl,
    MorphismIndexContext,
    ObjectCellEditor,
    type ObjectDecl,
    ObjectIndexContext,
    TheoryContext,
    newMorphismDecl,
    newObjectDecl,
    validateModel,
} from "../model";
import {
    type CellConstructor,
    type FormalCellEditorProps,
    NotebookEditor,
    cellShortcutModifier,
    newFormalCell,
} from "../notebook";
import { BrandedToolbar, HelpButton } from "../page";
import { type TheoryLibrary, TheoryLibraryContext } from "../stdlib";
import type { Theory } from "../theory";
import { PermissionsButton } from "../user";
import { type IndexedMap, indexMap } from "../util/indexing";
import { TheorySelectorDialog } from "./theory_selector";
import { type ModelDocument, newAnalysisDocument } from "./types";

import "./model_document_editor.css";

import ChartNetwork from "lucide-solid/icons/chart-network";

/** A model document "live" for editing.

Contains a reactive model document and an Automerge document handle, plus
various memos of derived data.
 */
export type LiveModelDocument = {
    /** The ref for which this is a live document. */
    refId: string;

    /** The model document, suitable for use in reactive contexts.

    This data should never be directly mutated. Instead, call `changeDoc` or
    interact directly with the Automerge document handle.
     */
    doc: ModelDocument;

    /** Make a change to the model document. */
    changeDoc: (f: ChangeFn<ModelDocument>) => void;

    /** The Automerge document handle for the model document. */
    docHandle: DocHandle<ModelDocument>;

    /** Permissions for the ref retrieved from the backend. */
    permissions: Permissions;

    /** A memo of the formal content of the model. */
    formalJudgments: Accessor<Array<ModelJudgment>>;

    /** A memo of the indexed map from object ID to name. */
    objectIndex: Accessor<IndexedMap<Uuid, string>>;

    /** A memo of the indexed map from morphism ID to name. */
    morphismIndex: Accessor<IndexedMap<Uuid, string>>;

    /** A memo of the double theory that the model is of, if it is defined. */
    theory: Accessor<Theory | undefined>;

    /** A memo of the result of validation.*/
    validationResult: Accessor<ModelValidationResult | undefined>;
};

export function enlivenModelDocument(
    refId: string,
    reactiveDoc: ReactiveDoc<ModelDocument>,
    theories: TheoryLibrary,
): LiveModelDocument {
    const { doc, docHandle, permissions } = reactiveDoc;

    const changeDoc = (f: ChangeFn<ModelDocument>) => docHandle.change(f);

    // Memo-ize the *formal* content of the notebook, since most derived objects
    // will not depend on the informal (rich-text) content in notebook.
    const formalJudgments = createMemo<Array<ModelJudgment>>(() => {
        return doc.notebook.cells
            .filter((cell) => cell.tag === "formal")
            .map((cell) => cell.content);
    }, []);

    const objectIndex = createMemo<IndexedMap<Uuid, string>>(() => {
        const map = new Map<Uuid, string>();
        for (const judgment of formalJudgments()) {
            if (judgment.tag === "object") {
                map.set(judgment.id, judgment.name);
            }
        }
        return indexMap(map);
    }, indexMap(new Map()));

    const morphismIndex = createMemo<IndexedMap<Uuid, string>>(() => {
        const map = new Map<Uuid, string>();
        for (const judgment of formalJudgments()) {
            if (judgment.tag === "morphism") {
                map.set(judgment.id, judgment.name);
            }
        }
        return indexMap(map);
    }, indexMap(new Map()));

    const theory = createMemo<Theory | undefined>(() => {
        if (doc.theory !== undefined) return theories.get(doc.theory);
    });

    const validationResult = createMemo<ModelValidationResult | undefined>(() => {
        const th = theory();
        return th ? validateModel(th.theory, formalJudgments()) : undefined;
    });

    return {
        refId,
        doc,
        changeDoc,
        docHandle,
        permissions,
        formalJudgments,
        objectIndex,
        morphismIndex,
        theory,
        validationResult,
    };
}

export default function ModelPage() {
    const params = useParams();
    const ref = params.ref;
    invariant(ref, "Must provide model ref as parameter to model page");

    const rpc = useContext(RpcContext);
    const repo = useContext(RepoContext);
    const theories = useContext(TheoryLibraryContext);
    invariant(rpc && repo && theories, "Missing context for model page");

    const [liveDoc] = createResource<LiveModelDocument>(async () => {
        const reactiveDoc = await getReactiveDoc<ModelDocument>(rpc, ref, repo);
        return enlivenModelDocument(ref, reactiveDoc, theories);
    });

    return (
        <Switch>
            <Match when={liveDoc.error}>
                <span>Error: {liveDoc.error}</span>
            </Match>
            <Match when={liveDoc()}>
                {(liveDoc) => <ModelDocumentEditor liveDoc={liveDoc()} />}
            </Match>
        </Switch>
    );
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
            // @ts-expect-error Work around upstream bug:
            // https://github.com/Aleph-Alpha/ts-rs/pull/359
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
