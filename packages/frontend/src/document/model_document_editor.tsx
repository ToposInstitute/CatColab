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

import type { Uuid } from "catlog-wasm";
import { RPCContext, RepoContext, retrieveDoc } from "../api";
import { IconButton, InlineInput, ResizableHandle } from "../components";
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
import { type TheoryLibrary, TheoryLibraryContext } from "../stdlib";
import type { Theory } from "../theory";
import { type IndexedMap, indexMap } from "../util/indexing";
import { type ModelDocument, newAnalysisDocument } from "./types";

import "./model_document_editor.css";

import Camera from "lucide-solid/icons/camera";
import PanelRight from "lucide-solid/icons/panel-right";
import PanelRightClose from "lucide-solid/icons/panel-right-close";

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
    validationResult: Accessor<ModelValidationResult | undefined>;
};

export function enlivenModelDocument(
    refId: string,
    doc: ModelDocument,
    docHandle: DocHandle<ModelDocument>,
    theories: TheoryLibrary,
): LiveModelDocument {
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
        docHandle,
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

    const client = useContext(RPCContext);
    const repo = useContext(RepoContext);
    const theories = useContext(TheoryLibraryContext);
    invariant(client && repo && theories, "Missing context for model page");

    const [liveDoc] = createResource<LiveModelDocument>(async () => {
        const { doc, docHandle } = await retrieveDoc<ModelDocument>(client, ref, repo);
        return enlivenModelDocument(ref, doc, docHandle, theories);
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
                {(liveDoc) => <ModelDocumentEditor liveDoc={liveDoc()} />}
            </Match>
        </Switch>
    );
}

export function ModelDocumentEditor(props: {
    liveDoc: LiveModelDocument;
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
                            <ModelPane liveDoc={props.liveDoc} />
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
        const init = newAnalysisDocument(props.forRef);
        const newDoc = repo.create(init);
        const newRef = await client.newRef.mutate({ title: init.name, docId: newDoc.documentId });

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
}) {
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Library of theories should be provided as context");

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
                        <For each={Array.from(theories.metadata())}>
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
                    [ModelValidationContext, liveDoc().validationResult],
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
