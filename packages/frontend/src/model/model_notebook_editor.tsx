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

import { DblModel, type InvalidDiscreteDblModel, type Uuid } from "catlog-wasm";
import { InlineInput } from "../components";
import {
    type CellActions,
    type CellConstructor,
    NotebookEditor,
    newFormalCell,
    newRichTextCell,
} from "../notebook";
import type { TheoryId, TheoryMeta } from "../theory";
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
    newMorphismDecl,
    newObjectDecl,
} from "./types";

import "./model_notebook_editor.css";

function judgementType(j: ModelJudgment): string | undefined {
    const theory = useContext(TheoryContext);

    if (j.tag === "object") {
        return theory?.()?.getObTypeMeta(j.obType)?.name;
    }

    if (j.tag === "morphism") {
        return theory?.()?.getMorTypeMeta(j.morType)?.name;
    }
}

/** Editor for a cell in a model of a discrete double theory.
 */
export function ModelCellEditor(props: {
    content: ModelJudgment;
    changeContent: (f: (content: ModelJudgment) => void) => void;
    isActive: boolean;
    actions: CellActions;
}) {
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

/** Reference to a `ModelNotebookEditor`.
 */
export type ModelNotebookRef = {
    // Get the data of the model.
    model: Accessor<Array<ModelJudgment>>;

    // Get the double theory that the model is of, if defined.
    theory: Accessor<TheoryMeta | undefined>;
};

/** Notebook-based editor for a model of a discrete double theory.
 */
export function ModelNotebookEditor(props: {
    handle: DocHandle<ModelNotebook>;
    init: ModelNotebook;
    theories: Map<TheoryId, TheoryMeta>;
    ref?: (ref: ModelNotebookRef) => void;
}) {
    const [theory, setTheory] = createSignal<TheoryMeta | undefined>();

    const [modelNb, changeModelNb] = useDoc(() => props.handle, props.init);

    // Memo-ize the *formal* content of the notebook, since most derived objects
    // will not depend on the informal (rich-text) content in notebook.
    const model = createMemo<Array<ModelJudgment>>(() =>
        modelNb()
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

    const modelErrors = createMemo<Map<Uuid, InvalidDiscreteDblModel<Uuid>[]>>(() => {
        let errs: InvalidDiscreteDblModel<Uuid>[] = [];
        const th = theory();
        if (th && th.theory.kind === "Discrete") {
            const coreModel = new DblModel(th.theory);
            for (const judgment of model()) {
                if (judgment.tag === "object") {
                    coreModel.addOb(judgment);
                } else if (judgment.tag === "morphism") {
                    coreModel.addMor(judgment);
                }
            }
            errs = coreModel.validate();
        }
        return indexArray(errs, (err) => err.content);
    });

    onMount(() => props.ref?.({ model, theory }));

    createEffect(() => {
        const id = modelNb().theory;
        setTheory(id !== undefined ? props.theories.get(id) : undefined);
    });

    return (
        <div class="model">
            <div class="model-head">
                <div class="model-title">
                    <InlineInput
                        text={modelNb().name}
                        setText={(text) => {
                            changeModelNb((model) => {
                                model.name = text;
                            });
                        }}
                    />
                </div>
                <div class="model-theory">
                    <select
                        required
                        disabled={modelNb().notebook.cells.some((cell) => cell.tag === "formal")}
                        value={modelNb().theory ?? ""}
                        onInput={(evt) => {
                            const id = evt.target.value;
                            changeModelNb((model) => {
                                model.theory = id ? id : undefined;
                            });
                        }}
                    >
                        <option value="" disabled selected hidden>
                            Choose a logic
                        </option>
                        <For each={Array.from(props.theories.values())}>
                            {(theory) => <option value={theory.id}>{theory.name}</option>}
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
                    cellType={judgementType}
                    path={["notebook"]}
                    notebook={modelNb().notebook}
                    changeNotebook={(f) => {
                        changeModelNb((model) => f(model.notebook));
                    }}
                    formalCellEditor={ModelCellEditor}
                    cellConstructors={modelCellConstructors(theory())}
                />
            </MultiProvider>
        </div>
    );
}

type ModelCellConstructor = CellConstructor<ModelJudgment>;

function modelCellConstructors(theory?: TheoryMeta): ModelCellConstructor[] {
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
