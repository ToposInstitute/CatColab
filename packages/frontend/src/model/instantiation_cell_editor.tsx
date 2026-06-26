import type { DocInfo } from "catcolab-api/src/user_state";
import { batch, createEffect, Index, Show, splitProps, untrack, useContext } from "solid-js";
import invariant from "tiny-invariant";

import {
    type FocusHandle,
    NameInput,
    type TextInputOptions,
    useChildFocus,
} from "catcolab-ui-components";
import type { DblModel, InstantiatedModel, Ob, SpecializeModel } from "catlog-wasm";
import { useApi } from "../api";
import { DocumentPicker, IdInput, IdInputPlaceholder } from "../components";
import type { CellActions } from "../notebook";
import { DocRefIdContext } from "../page/context";
import { useUserState } from "../user/user_state_context";
import { LiveModelContext, ModelLibraryContext } from "./context";
import { ObInput } from "./object_input";

import "./instantiation_cell_editor.css";

/** Editor for an instantiation cell in a model */
export function InstantiationCellEditor(props: {
    instantiation: InstantiatedModel;
    modifyInstantiation: (f: (inst: InstantiatedModel) => void) => void;
    focus: FocusHandle;
    actions: CellActions;
}) {
    const api = useApi();
    const docRefId = useContext(DocRefIdContext);
    const liveModel = useContext(LiveModelContext);
    const userState = useUserState();

    const filterCompletions = (refId: string, doc: DocInfo) => {
        if (doc.typeName !== "model") {
            return false;
        }
        if (docRefId && refId === docRefId()) {
            return false;
        }
        const theory = liveModel?.().liveDoc.doc.theory;
        if (theory && doc.theory !== theory) {
            return false;
        }
        return true;
    };

    const refId = () => props.instantiation.model?._id;
    const setRefId = (refId: string | null) => {
        props.modifyInstantiation((inst) => {
            inst.model = refId ? api.makeUnversionedLink(refId, "instantiation") : null;
            // Auto-fill the name from the selected model's title when unnamed.
            if (refId && !inst.name) {
                const docName = userState.documents[refId]?.name;
                if (docName) {
                    inst.name = docName;
                }
            }
        });
    };

    const models = useContext(ModelLibraryContext);
    invariant(models);
    const instantiated = models.useElaboratedModel(refId);

    // oxlint-disable-next-line solid/reactivity -- Focus handles are stable for a mounted cell.
    const focus = useChildFocus<InstantiationCellComponent>(props.focus, {
        default: refId() == null ? "model" : "name",
    });
    const specializationFocus = useChildFocus<number>(focus.childFocus("specializations"), {
        default: 0,
    });
    const activateIndex = (index: number) =>
        batch(() => {
            focus.setActiveChild("specializations");
            specializationFocus.setActiveChild(index);
        });

    const insertSpecializationAtTop = () => {
        props.modifyInstantiation((inst) => {
            inst.specializations.unshift({ id: null, ob: null });
        });
        activateIndex(0);
    };

    const appendSpecialization = () => {
        let newIndex = 0;
        props.modifyInstantiation((inst) => {
            inst.specializations.push({ id: null, ob: null });
            newIndex = inst.specializations.length - 1;
        });
        activateIndex(newIndex);
    };

    // Track the displayed text in each specialization row's id input so we can
    // distinguish a fully-empty row from one with invalid (incomplete) text.
    // The ob input is only rendered when id is set, so we don't need to track
    // its text for emptiness detection.
    const idInputTexts = new Map<number, string>();

    /** Drop specialization rows whose id and ob are both null AND whose visible
     * text in the id input is empty. Rows with invalid (non-empty) text are
     * kept so the user can correct them.
     */
    const pruneEmptySpecializations = () => {
        const specs = props.instantiation.specializations;
        // Collect indices of empty rows in increasing order.
        const removedIndices: number[] = [];
        for (let i = 0; i < specs.length; i++) {
            const spec = specs[i]!;
            const idText = idInputTexts.get(i) ?? "";
            if (spec.id == null && spec.ob == null && idText === "") {
                removedIndices.push(i);
            }
        }
        if (removedIndices.length === 0) {
            return;
        }
        // Splice in reverse order so earlier indices stay valid; this avoids
        // creating a new array and reassigning, which would copy proxy objects.
        props.modifyInstantiation((inst) => {
            for (let k = removedIndices.length - 1; k >= 0; k--) {
                inst.specializations.splice(removedIndices[k]!, 1);
            }
        });
        // Remap the text-tracking map to the new indices.
        const removedSet = new Set(removedIndices);
        const newIdTexts = new Map<number, string>();
        let newIdx = 0;
        for (let oldIdx = 0; oldIdx < specs.length; oldIdx++) {
            if (removedSet.has(oldIdx)) {
                continue;
            }
            const idText = idInputTexts.get(oldIdx);
            if (idText !== undefined) {
                newIdTexts.set(newIdx, idText);
            }
            newIdx++;
        }
        idInputTexts.clear();
        for (const [k, v] of newIdTexts) {
            idInputTexts.set(k, v);
        }
    };

    // Clean up empty rows when the cell becomes inactive.
    createEffect(() => {
        if (!props.focus.hasFocus()) {
            untrack(() => pruneEmptySpecializations());
        }
    });

    const exitDownFromTop = () => {
        if (props.instantiation.specializations.length === 0) {
            props.actions.activateBelow();
        } else {
            activateIndex(0);
        }
    };

    return (
        <div class="formal-judgment">
            <div class="model-instantiation-decl">
                <NameInput
                    name={props.instantiation.name}
                    setName={(name) =>
                        props.modifyInstantiation((inst) => {
                            inst.name = name;
                        })
                    }
                    placeholder="Unnamed"
                    createBelow={insertSpecializationAtTop}
                    deleteBackward={props.actions.deleteBackward}
                    deleteForward={props.actions.deleteForward}
                    exitUp={props.actions.activateAbove}
                    exitDown={exitDownFromTop}
                    exitRight={() => focus.setActiveChild("model")}
                    exitForward={() => focus.setActiveChild("model")}
                    focus={focus.childFocus("name")}
                />
                <span class="is-a" />
                <DocumentPicker
                    refId={refId() ?? null}
                    setRefId={(newRefId) => {
                        setRefId(newRefId);
                        // After picking a model, move focus out of the picker
                        // and into the specializations area so the user can
                        // keep going on the keyboard. If there are no rows
                        // yet, add an empty one to focus.
                        if (newRefId) {
                            if (props.instantiation.specializations.length === 0) {
                                insertSpecializationAtTop();
                            } else {
                                activateIndex(0);
                            }
                        }
                    }}
                    filterCompletions={filterCompletions}
                    placeholder="..."
                    deleteBackward={() => focus.setActiveChild("name")}
                    exitUp={props.actions.activateAbove}
                    exitDown={exitDownFromTop}
                    exitLeft={() => focus.setActiveChild("name")}
                    exitBackward={() => focus.setActiveChild("name")}
                    focus={focus.childFocus("model")}
                />
            </div>
            <ul
                class="model-specializations"
                classList={{ "has-instantiated": instantiated() != null }}
            >
                <Index each={props.instantiation.specializations}>
                    {(spec, i) => (
                        <li>
                            <SpecializationEditor
                                specialization={spec()}
                                modifySpecialization={(f) => {
                                    props.modifyInstantiation((inst) => {
                                        const spec = inst.specializations[i];
                                        invariant(spec);
                                        f(spec);
                                    });
                                }}
                                onIdTextChange={(text) => idInputTexts.set(i, text)}
                                instantiatedModel={instantiated()?.validatedModel.model ?? null}
                                focus={specializationFocus.childFocus(i)}
                                createBelow={() => {
                                    props.modifyInstantiation((inst) => {
                                        const spec = { id: null, ob: null };
                                        inst.specializations.splice(i + 1, 0, spec);
                                    });
                                    activateIndex(i + 1);
                                }}
                                deleteBackward={() => {
                                    props.modifyInstantiation((inst) =>
                                        inst.specializations.splice(i, 1),
                                    );
                                    i === 0 ? focus.setActiveChild("name") : activateIndex(i - 1);
                                }}
                                exitDown={() => {
                                    if (i >= props.instantiation.specializations.length - 1) {
                                        props.actions.activateBelow();
                                    } else {
                                        activateIndex(i + 1);
                                    }
                                }}
                                exitUp={() => {
                                    i === 0 ? focus.setActiveChild("name") : activateIndex(i - 1);
                                }}
                            />
                        </li>
                    )}
                </Index>
                <Show when={instantiated()}>
                    <li
                        class="model-specialization-add"
                        onMouseDown={(evt) => {
                            appendSpecialization();
                            props.focus.setFocused(true);
                            evt.preventDefault();
                        }}
                    >
                        <div class="model-specialization">
                            <IdInputPlaceholder />
                            <span class="specialize-as" />
                            <IdInputPlaceholder />
                        </div>
                    </li>
                </Show>
            </ul>
        </div>
    );
}

type InstantiationCellComponent = "name" | "model" | "specializations";

function SpecializationEditor(
    allProps: {
        specialization: SpecializeModel;
        modifySpecialization: (f: (spec: SpecializeModel) => void) => void;
        instantiatedModel: DblModel | null;
        /** Called when the displayed text of the id input changes. */
        onIdTextChange?: (text: string) => void;
        focus: FocusHandle;
    } & Pick<TextInputOptions, "createBelow" | "deleteBackward" | "exitDown" | "exitUp">,
) {
    const [inputProps, props] = splitProps(allProps, ["createBelow", "exitDown", "exitUp"]);

    // oxlint-disable-next-line solid/reactivity -- Focus handles are stable for a mounted row.
    const focus = useChildFocus<SpecializationEditorInput>(props.focus, { default: "id" });

    const obType = () => {
        const id = props.specialization.id;
        if (id) {
            const ob: Ob = { tag: "Basic", content: id };
            if (props.instantiatedModel?.hasOb(ob)) {
                return props.instantiatedModel.obType(ob);
            }
        }
    };

    return (
        <div class="model-specialization">
            <IdInput
                placeholder="..."
                id={props.specialization.id}
                setId={(id) => {
                    props.modifySpecialization((spec) => {
                        spec.id = id;
                    });
                }}
                onTextChange={props.onIdTextChange}
                completions={props.instantiatedModel?.obGenerators()}
                idToLabel={(id) => props.instantiatedModel?.obGeneratorLabel(id)}
                labelToId={(label) => props.instantiatedModel?.obGeneratorWithLabel(label)}
                focus={focus.childFocus("id")}
                deleteBackward={props.deleteBackward}
                exitForward={() => focus.setActiveChild("ob")}
                exitRight={() => focus.setActiveChild("ob")}
                {...inputProps}
            />
            <span class="specialize-as" />
            <Show when={obType()} fallback={<IdInputPlaceholder />}>
                {(obType) => (
                    <ObInput
                        placeholder="..."
                        ob={props.specialization.ob}
                        setOb={(ob) => {
                            props.modifySpecialization((spec) => {
                                spec.ob = ob;
                            });
                        }}
                        obType={obType()}
                        focus={focus.childFocus("ob")}
                        deleteBackward={() => focus.setActiveChild("id")}
                        exitBackward={() => focus.setActiveChild("id")}
                        exitLeft={() => focus.setActiveChild("id")}
                        {...inputProps}
                    />
                )}
            </Show>
        </div>
    );
}

type SpecializationEditorInput = "id" | "ob";
