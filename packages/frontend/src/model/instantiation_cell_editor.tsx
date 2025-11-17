import { batch, createSignal, Index, Show, splitProps, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { NameInput, type TextInputOptions } from "catcolab-ui-components";
import type { DblModel, InstantiatedModel, Ob, SpecializeModel } from "catlog-wasm";
import { useApi } from "../api";
import { DocumentPicker, IdInput } from "../components";
import type { CellActions } from "../notebook";
import { ModelLibraryContext } from "./context";
import { ObInput } from "./object_input";

import "./instantiation_cell_editor.css";

/** Editor for an instantiation cell in a model */
export function InstantiationCellEditor(props: {
    instantiation: InstantiatedModel;
    modifyInstantiation: (f: (inst: InstantiatedModel) => void) => void;
    isActive: boolean;
    actions: CellActions;
}) {
    const api = useApi();

    const refId = () => props.instantiation.model?._id;
    const setRefId = (refId: string | null) => {
        props.modifyInstantiation((inst) => {
            inst.model = refId ? api.makeUnversionedLink(refId, "instantiation") : null;
        });
    };

    const models = useContext(ModelLibraryContext);
    invariant(models);
    const instantiated = models.useElaboratedModel(refId);

    const [activeComponent, setActiveComponent] = createSignal<InstantiationCellComponent>("name");
    const [activeIndex, setActiveIndex] = createSignal(0);
    const activateIndex = (index: number) =>
        batch(() => {
            setActiveComponent("specializations");
            setActiveIndex(index);
        });

    const insertSpecializationAtTop = () => {
        props.modifyInstantiation((inst) => {
            inst.specializations.unshift({ id: null, ob: null });
        });
        activateIndex(0);
    };

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
                    exitRight={() => setActiveComponent("model")}
                    exitForward={() => setActiveComponent("model")}
                    isActive={props.isActive && activeComponent() === "name"}
                    hasFocused={() => {
                        setActiveComponent("name");
                        props.actions.hasFocused();
                    }}
                />
                <span class="is-a" />
                <DocumentPicker
                    refId={refId() ?? null}
                    setRefId={(refId) => {
                        setRefId(refId);
                        insertSpecializationAtTop();
                    }}
                    placeholder="..."
                    deleteBackward={() => setActiveComponent("name")}
                    exitUp={props.actions.activateAbove}
                    exitDown={exitDownFromTop}
                    exitLeft={() => setActiveComponent("name")}
                    exitBackward={() => setActiveComponent("name")}
                    isActive={props.isActive && activeComponent() === "model"}
                    hasFocused={() => {
                        setActiveComponent("model");
                        props.actions.hasFocused();
                    }}
                />
            </div>
            <ul class="model-specializations">
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
                                instantiatedModel={instantiated()?.validatedModel.model ?? null}
                                isActive={
                                    props.isActive &&
                                    activeComponent() === "specializations" &&
                                    activeIndex() === i
                                }
                                hasFocused={() => {
                                    activateIndex(i);
                                    props.actions.hasFocused();
                                }}
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
                                    i === 0 ? setActiveComponent("name") : activateIndex(i - 1);
                                }}
                                exitDown={() => {
                                    if (i >= props.instantiation.specializations.length - 1) {
                                        props.actions.activateBelow();
                                    } else {
                                        activateIndex(i + 1);
                                    }
                                }}
                                exitUp={() => {
                                    i === 0 ? setActiveComponent("name") : activateIndex(i - 1);
                                }}
                            />
                        </li>
                    )}
                </Index>
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
    } & Pick<
        TextInputOptions,
        "isActive" | "hasFocused" | "createBelow" | "deleteBackward" | "exitDown" | "exitUp"
    >,
) {
    const [inputProps, props] = splitProps(allProps, ["createBelow", "exitDown", "exitUp"]);

    const [activeInput, setActiveInput] = createSignal<SpecializationEditorInput>("id");

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
                completions={props.instantiatedModel?.obGenerators()}
                idToLabel={(id) => props.instantiatedModel?.obGeneratorLabel(id)}
                labelToId={(label) => props.instantiatedModel?.obGeneratorWithLabel(label)}
                isActive={props.isActive && activeInput() === "id"}
                hasFocused={() => {
                    setActiveInput("id");
                    props.hasFocused?.();
                }}
                deleteBackward={props.deleteBackward}
                exitForward={() => setActiveInput("ob")}
                exitRight={() => setActiveInput("ob")}
                {...inputProps}
            />
            <span class="specialize-as" />
            <Show when={obType()} fallback={<span class="placeholder">{"..."}</span>}>
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
                        isActive={props.isActive && activeInput() === "ob"}
                        hasFocused={() => {
                            setActiveInput("ob");
                            props.hasFocused?.();
                        }}
                        deleteBackward={() => setActiveInput("id")}
                        exitBackward={() => setActiveInput("id")}
                        exitLeft={() => setActiveInput("id")}
                        {...inputProps}
                    />
                )}
            </Show>
        </div>
    );
}

type SpecializationEditorInput = "id" | "ob";
