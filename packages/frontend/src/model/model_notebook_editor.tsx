import type { DocHandle } from "@automerge/automerge-repo";
import { MultiProvider } from "@solid-primitives/context";
import {
    type Accessor,
    For,
    Match,
    Switch,
    createEffect,
    createMemo,
    createSignal,
    onMount,
    useContext,
} from "solid-js";

import { useDoc } from "../util/automerge_solid";
import { type IndexedMap, indexArray, indexMap } from "../util/indexing";

import type { DblModel, InvalidDiscreteDblModel, Uuid } from "catlog-wasm";
import { InlineInput } from "../components";
import {
    type CellConstructor,
    type FormalCellEditorProps,
    NotebookEditor,
    newFormalCell,
    newRichTextCell,
} from "../notebook";
import type { TheoryLibrary } from "../stdlib";
import type { Theory } from "../theory";
import {
    ModelErrorsContext,
    MorphismIndexContext,
    ObjectIndexContext,
    TheoryContext,
} from "./model_context";
import { MorphismCellEditor } from "./morphism_cell_editor";
import { ObjectCellEditor } from "./object_cell_editor";
import {
    type ModelJudgment,
    type ModelNotebook,
    type MorphismDecl,
    type ObjectDecl,
    catlogModel,
    newMorphismDecl,
    newObjectDecl,
} from "./types";

import "./model_notebook_editor.css";

/** Reference to a `ModelNotebookEditor`.
 */
export type ModelNotebookRef = {
    // Get the model notebook.
    modelNotebook: Accessor<ModelNotebook>;

    // Change the model notebook.
    changeModelNotebook: (f: (data: ModelNotebook) => void) => void;

    // Get the formal content of the model.
    model: Accessor<Array<ModelJudgment>>;

    // Get the double theory that the model is of, if it is defined.
    theory: Accessor<Theory | undefined>;

    // Get the `catlog` model object, if it is valid.
    validatedModel: Accessor<DblModel | null>;
};

/** Notebook-based editor for a model of a double theory.
 */
export function ModelNotebookEditor(props: {
    handle: DocHandle<ModelNotebook>;
    init: ModelNotebook;
    theories: TheoryLibrary;
    ref?: (ref: ModelNotebookRef) => void;
}) {
    const [theory, setTheory] = createSignal<Theory | undefined>();

    const [modelNotebook, changeModelNotebook] = useDoc(() => props.handle, props.init);

    // Memo-ize the *formal* content of the notebook, since most derived objects
    // will not depend on the informal (rich-text) content in notebook.
    const model = createMemo<Array<ModelJudgment>>(() =>
        modelNotebook()
            .notebook.cells.filter((cell) => cell.tag === "formal")
            .map((cell) => cell.content),
    );

    const objectIndex = createMemo<IndexedMap<Uuid, string>>(() => {
        const map = new Map<Uuid, string>();
        for (const judgment of model()) {
            if (judgment.tag === "object") {
                map.set(judgment.id, judgment.name);
            }
        }
        return indexMap(map);
    });

    const morphismIndex = createMemo<IndexedMap<Uuid, string>>(() => {
        const map = new Map<Uuid, string>();
        for (const judgment of model()) {
            if (judgment.tag === "morphism") {
                map.set(judgment.id, judgment.name);
            }
        }
        return indexMap(map);
    });

    const [modelErrors, setModelErrors] = createSignal<Map<Uuid, InvalidDiscreteDblModel<Uuid>[]>>(
        new Map(),
    );
    const [validatedModel, setValidatedModel] = createSignal<DblModel | null>(null);

    onMount(() =>
        props.ref?.({ modelNotebook, changeModelNotebook, model, theory, validatedModel }),
    );

    createEffect(() => {
        const id = modelNotebook().theory;
        setTheory(id !== undefined ? props.theories.get(id) : undefined);
    });

    createEffect(() => {
        let errs: InvalidDiscreteDblModel<Uuid>[] = [];
        let validatedModel = null;
        const th = theory();
        if (th && th.theory.kind === "Discrete") {
            // NOTE: Validation not yet implemented for other theory kinds.
            const dblModel = catlogModel(th.theory, model());
            errs = dblModel.validate();
            if (errs.length === 0) {
                validatedModel = dblModel;
            }
        }
        setModelErrors(indexArray(errs, (err) => err.content));
        setValidatedModel(validatedModel);
    });

    return (
        <div class="model">
            <div class="model-head">
                <div class="model-title">
                    <InlineInput
                        text={modelNotebook().name}
                        setText={(text) => {
                            changeModelNotebook((model) => {
                                model.name = text;
                            });
                        }}
                    />
                </div>
                <div class="model-theory">
                    <select
                        required
                        disabled={modelNotebook().notebook.cells.some(
                            (cell) => cell.tag === "formal",
                        )}
                        value={modelNotebook().theory ?? ""}
                        onInput={(evt) => {
                            const id = evt.target.value;
                            changeModelNotebook((model) => {
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
                    [TheoryContext, theory],
                    [ObjectIndexContext, objectIndex],
                    [MorphismIndexContext, morphismIndex],
                    [ModelErrorsContext, modelErrors],
                ]}
            >
                <NotebookEditor
                    handle={props.handle}
                    path={["notebook"]}
                    notebook={modelNotebook().notebook}
                    changeNotebook={(f) => {
                        changeModelNotebook((model) => f(model.notebook));
                    }}
                    formalCellEditor={ModelCellEditor}
                    cellConstructors={modelCellConstructors(theory())}
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

type ModelCellConstructor = CellConstructor<ModelJudgment>;

function modelCellConstructors(theory?: Theory): ModelCellConstructor[] {
    // On Mac, the Alt/Option key remaps keys, whereas on other platforms
    // Control tends to be already bound in other shortcuts.
    const modifier = navigator.userAgent.includes("Mac") ? "Control" : "Alt";

    const result: ModelCellConstructor[] = [
        {
            name: "Text",
            description: "Start writing ordinary text",
            shortcut: [modifier, "T"],
            construct: () => newRichTextCell(),
        },
    ];

    for (const typ of theory?.types.values() ?? []) {
        const { name, description, shortcut } = typ;
        result.push({
            name,
            description,
            shortcut: shortcut && [modifier, ...shortcut],
            construct:
                typ.tag === "ObType"
                    ? () => newFormalCell(newObjectDecl(typ.obType))
                    : () => newFormalCell(newMorphismDecl(typ.morType)),
        });
    }

    return result;
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
