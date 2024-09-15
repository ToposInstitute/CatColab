import type { DocHandle } from "@automerge/automerge-repo";
import Resizable, { type ContextValue } from "@corvu/resizable";
import { MultiProvider } from "@solid-primitives/context";
import { useNavigate, useParams } from "@solidjs/router";
import {
    type Accessor,
    For,
    Match,
    Show,
    Switch,
    createEffect,
    createMemo,
    createResource,
    createSignal,
    useContext,
} from "solid-js";
import invariant from "tiny-invariant";

import type { DblModel, InvalidDiscreteDblModel, Uuid } from "catlog-wasm";
import { RPCContext, RepoContext, type RetrievedDoc, retrieveDoc } from "../api";
import { IconButton, InlineInput, ResizableHandle } from "../components";
import {
    type ModelJudgment,
    MorphismCellEditor,
    type MorphismDecl,
    ObjectCellEditor,
    type ObjectDecl,
    catlogModel,
    newMorphismDecl,
    newObjectDecl,
} from "../model";
import {
    ModelErrorsContext,
    MorphismIndexContext,
    ObjectIndexContext,
    TheoryContext,
} from "../model/model_context";
import {
    type CellConstructor,
    type FormalCellEditorProps,
    NotebookEditor,
    cellShortcutModifier,
    newFormalCell,
    newNotebook,
} from "../notebook";
import { type TheoryLibrary, stdTheories } from "../stdlib";
import type { Theory } from "../theory";
import { type IndexedMap, indexArray, indexMap } from "../util/indexing";
import type { AnalysisDocument, ModelDocument } from "./types";

import "./model_document_editor.css";

import Camera from "lucide-solid/icons/camera";
import PanelRight from "lucide-solid/icons/panel-right";
import PanelRightClose from "lucide-solid/icons/panel-right-close";

export type ValidatedModel = {
    tag: "validated";
    value: DblModel;
};

export type ValidationErrors = {
    tag: "errors";
    value: Map<Uuid, InvalidDiscreteDblModel<Uuid>[]>;
};

// TODO: This should go away because all models should support validation!
export type ValidationNotSupported = {
    tag: "notsupported";
};

export type ValidationResult = ValidatedModel | ValidationErrors | ValidationNotSupported;

/** A model document "live" for editing.

Contains a model document and Automerge document handle, plus various memos of
 derived data.
 */
export type LiveModelDocument = {
    /** The ref for which this is a live document. */
    refId: string;

    /** The model document.

    Produced via `makeDocReactive` so that accessing fields of this document in
    reactive contexts will be appropriately reactive.
    */
    doc: ModelDocument;

    /** The document handle for the model document.*/
    docHandle: DocHandle<ModelDocument>;

    /** A memo of the formal content of the model. */
    formalJudgments: Accessor<Array<ModelJudgment>>;

    /** A memo of the indexed map from object ID to name. */
    objectIndex: Accessor<IndexedMap<Uuid, string>>;

    /** A memo of the indexed map from morphism ID to name. */
    morphismIndex: Accessor<IndexedMap<Uuid, string>>;

    /** A memo of the double theory that the model is of, if it is defined. */
    theory: Accessor<Theory | undefined>;

    /** A memo of the result of validation.*/
    validationResult: Accessor<ValidationResult>;

    /** Any validation errors. */
    modelErrors: Accessor<Map<Uuid, InvalidDiscreteDblModel<Uuid>[]>>;
};

export function enliveModelDocument(
    refId: string,
    rdoc: RetrievedDoc<ModelDocument>,
    theories: TheoryLibrary,
): LiveModelDocument {
    const { doc, docHandle } = rdoc;
    // Memo-ize the *formal* content of the notebook, since most derived objects
    // will not depend on the informal (rich-text) content in notebook.
    const formalJudgments = createMemo<Array<ModelJudgment>>(() =>
        doc.notebook.cells.filter((cell) => cell.tag === "formal").map((cell) => cell.content),
    );

    const objectIndex = createMemo<IndexedMap<Uuid, string>>(() => {
        const map = new Map<Uuid, string>();
        for (const judgment of formalJudgments()) {
            if (judgment.tag === "object") {
                map.set(judgment.id, judgment.name);
            }
        }
        return indexMap(map);
    });

    const morphismIndex = createMemo<IndexedMap<Uuid, string>>(() => {
        const map = new Map<Uuid, string>();
        for (const judgment of formalJudgments()) {
            if (judgment.tag === "morphism") {
                map.set(judgment.id, judgment.name);
            }
        }
        return indexMap(map);
    });

    const theory = createMemo(() => {
        if (doc.theory !== undefined) return theories.get(doc.theory);
    });

    const validationResult: Accessor<ValidationResult> = createMemo(() => {
        const th = theory();
        if (th && th.theory.kind === "Discrete") {
            const dblModel = catlogModel(th.theory, formalJudgments());
            const errs: InvalidDiscreteDblModel<Uuid>[] = dblModel.validate();
            if (errs.length === 0) {
                return { tag: "validated", value: dblModel } as ValidatedModel;
            } else {
                return {
                    tag: "errors",
                    value: indexArray(errs, (err) => err.content),
                } as ValidationErrors;
            }
        } else {
            return { tag: "notsupported" } as ValidationNotSupported;
        }
    });

    const modelErrors = createMemo(() => {
        const result = validationResult();
        if (result.tag === "errors") {
            return result.value;
        } else {
            return new Map();
        }
    });

    return {
        refId,
        doc,
        docHandle,
        formalJudgments,
        objectIndex,
        morphismIndex,
        theory,
        validationResult,
        modelErrors,
    };
}

export function ModelPage() {
    const params = useParams();

    const client = useContext(RPCContext);
    invariant(client, "Must provide a value for RPCContext to use ModelPage");

    const repo = useContext(RepoContext);
    invariant(repo, "Must provide a value for RepoContext to use ModelPage");

    const [liveDoc] = createResource(async () => {
        const rdoc = await retrieveDoc<ModelDocument>(client, params.ref, repo);
        return enliveModelDocument(params.ref, rdoc, stdTheories);
    });

    return (
        <Switch>
            <Match when={liveDoc.loading}>
                <p>Loading...</p>
            </Match>
            <Match when={liveDoc.error}>
                <span>Error: {liveDoc.error}</span>
            </Match>
            <Match when={liveDoc()}>
                {(liveDoc) => <ModelDocumentEditor liveDoc={liveDoc()} theories={stdTheories} />}
            </Match>
        </Switch>
    );
}

export function ModelDocumentEditor(props: {
    liveDoc: LiveModelDocument;
    theories: TheoryLibrary;
}) {
    const client = useContext(RPCContext);
    invariant(client, "Must provide RPCContext");

    const snapshotModel = () =>
        client.saveRef.mutate({
            refId: props.liveDoc.refId,
            note: "",
        });

    const [resizableContext, setResizableContext] = createSignal<ContextValue>();
    const [isSidePanelOpen, setSidePanelOpen] = createSignal(false);

    createEffect(() => {
        const context = resizableContext();
        if (context !== undefined) {
            if (isSidePanelOpen()) {
                context.expand(1);
            } else {
                context.collapse(1);
            }
        }
    });

    const toggleSidePanel = () => {
        const open = setSidePanelOpen(!isSidePanelOpen());
        if (open) {
            resizableContext()?.resize(1, 0.33);
        }
    };

    return (
        <Resizable class="growable-container">
            {() => {
                const context = Resizable.useContext();
                setResizableContext(context);

                return (
                    <>
                        <Resizable.Panel
                            class="content-panel"
                            collapsible
                            initialSize={1}
                            minSize={0.25}
                        >
                            <div class="toolbar">
                                <IconButton onClick={snapshotModel}>
                                    <Camera />
                                </IconButton>
                                <span class="filler" />
                                <IconButton onClick={toggleSidePanel}>
                                    <Show when={isSidePanelOpen()} fallback={<PanelRight />}>
                                        <PanelRightClose />
                                    </Show>
                                </IconButton>
                            </div>
                            <ModelPane liveDoc={props.liveDoc} theories={props.theories} />
                        </Resizable.Panel>
                        <ResizableHandle hidden={!isSidePanelOpen()} />
                        <Resizable.Panel
                            class="content-panel side-panel"
                            collapsible
                            initialSize={0}
                            minSize={0.25}
                            hidden={!isSidePanelOpen()}
                            onCollapse={() => setSidePanelOpen(false)}
                            onExpand={() => setSidePanelOpen(true)}
                        >
                            <div class="notebook-container">
                                <AnalysesPane
                                    forRef={props.liveDoc.refId}
                                    title={props.liveDoc.doc.name}
                                />
                            </div>
                        </Resizable.Panel>
                    </>
                );
            }}
        </Resizable>
    );
}

function AnalysesPane(props: { forRef: string; title: string }) {
    const client = useContext(RPCContext);
    invariant(client, "Must provide RPCContext");

    const [analyses] = createResource(async () => {
        return await client.getBacklinks.query({ refId: props.forRef, taxon: "analysis" });
    });

    const repo = useContext(RepoContext);
    invariant(repo, "Must provide RepoContext");

    const navigator = useNavigate();

    const createAnalysis = async () => {
        const init: AnalysisDocument = {
            name: "Untitled",
            type: "analysis",
            modelRef: {
                __extern__: {
                    refId: props.forRef,
                    taxon: "analysis",
                    via: null,
                },
            },
            notebook: newNotebook(),
        };
        const newDoc = repo.create(init);
        const newRef = await client.newRef.mutate({ title: "Untitled", docId: newDoc.documentId });

        navigator(`/analysis/${newRef}`);
    };

    return (
        <div>
            <h2>Analyses for {props.title}</h2>
            <Show when={analyses()}>
                {(analyses) => {
                    return (
                        <ul>
                            <For each={analyses()}>
                                {(ref) => (
                                    <li>
                                        <a href={`/analysis/${ref}`}>{ref}</a>
                                    </li>
                                )}
                            </For>
                        </ul>
                    );
                }}
            </Show>
            <button onclick={createAnalysis}>New analysis</button>
        </div>
    );
}

export function ModelPane(props: {
    liveDoc: LiveModelDocument;
    theories: TheoryLibrary;
}) {
    const liveDoc = () => props.liveDoc;
    const doc = () => props.liveDoc.doc;
    const docHandle = () => props.liveDoc.docHandle;
    return (
        <div class="notebook-container">
            <div class="model-head">
                <div class="model-title">
                    <InlineInput
                        text={doc().name}
                        setText={(text) => {
                            docHandle().change((doc) => {
                                doc.name = text;
                            });
                        }}
                    />
                </div>
                <div class="model-theory">
                    <select
                        required
                        disabled={doc().notebook.cells.some((cell) => cell.tag === "formal")}
                        value={doc().theory ?? ""}
                        onInput={(evt) => {
                            const id = evt.target.value;
                            docHandle().change((model) => {
                                model.theory = id ? id : undefined;
                            });
                        }}
                    >
                        <option value="" disabled selected hidden>
                            Choose a logic
                        </option>
                        <For each={Array.from(props.theories.metadata())}>
                            {(meta) => <option value={meta.id}>{meta.name}</option>}
                        </For>
                    </select>
                </div>
            </div>
            <MultiProvider
                values={[
                    [TheoryContext, liveDoc().theory],
                    [ObjectIndexContext, liveDoc().objectIndex],
                    [MorphismIndexContext, liveDoc().morphismIndex],
                    [ModelErrorsContext, liveDoc().modelErrors],
                ]}
            >
                <NotebookEditor
                    handle={docHandle()}
                    path={["notebook"]}
                    notebook={doc().notebook}
                    changeNotebook={(f) => {
                        docHandle().change((doc) => f(doc.notebook));
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
