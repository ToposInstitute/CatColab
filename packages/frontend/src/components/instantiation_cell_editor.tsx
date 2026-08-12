import type { DocInfo } from "catcolab-api/src/user_state";
import type { Accessor } from "solid-js";
import { batch, createEffect, Index, Show, splitProps, untrack, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { Nb } from "catcolab-document-methods";
import {
    type FocusHandle,
    NameInput,
    type TextInputOptions,
    useChildFocus,
} from "catcolab-ui-components";
import type { Ob, DblModel } from "catlog-wasm";
import type { CellActions } from "../notebook";
import { IdInput, IdInputPlaceholder } from "./id_input.tsx";
import { DocumentPicker } from "./document_picker.tsx";
import { ObInput } from "./object_input";

import "./instantiation_cell_editor.css";

export type Specialization = { id: string | null; ob: Ob | null };

export interface InstantiatedSomething {
    name: string;
    specializations: Specialization[];
}

export function InstantiationCellEditor(
    props: {
        instantiation: InstantiatedSomething;
        modifyInstantiation: (f: (inst: InstantiatedSomething) => void) => void;
        pickerConfig: PickerConfig;
        specializationConfig: InstantiationConfig;
    } & CellEditorProps,
) {
    // oxlint-disable-next-line solid/reactivity -- Focus handles are stable for a mounted cell.
    const focus = useChildFocus<InstantiationCellComponent>(props.focus, {
        default: props.config.refId() == null ? props.config.kind : "name",
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
        const specs = props.instantiation?.specializations;
        if (specs == undefined) {
            return;
        }
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
        if (props.instantiation?.specializations.length === 0) {
            props.actions.activateBelow();
        } else {
            activateIndex(0);
        }
    };

    // In diagrams, there are instantiatedJudgments, obJudgments, obGenerators, etc.
    return (
        <div class="formal-judgment">
            <div class="something-instantiation-decl">
                <NameInput
                    name={props.instantiation?.name}
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
                    exitRight={() => focus.setActiveChild(props.config.kind)}
                    exitForward={() => focus.setActiveChild(props.config.kind)}
                    focus={focus.childFocus("name")}
                />
                <span class="is-a" />
                <DocumentPicker
                    refId={props.config.refId() ?? null}
                    setRefId={(newRefId) => {
                        props.config.setRefId(newRefId);
                        // After picking a something, move focus out of the picker
                        // and into the specializations area so the user can
                        // keep going on the keyboard. If there are no rows
                        // yet, add an empty one to focus.
                        if (newRefId) {
                            if (props.instantiation?.specializations.length === 0) {
                                insertSpecializationAtTop();
                            } else {
                                activateIndex(0);
                            }
                        }
                    }}
                    filterCompletions={props.config.filterCompletions}
                    placeholder="..."
                    deleteBackward={() => focus.setActiveChild("name")}
                    exitUp={props.actions.activateAbove}
                    exitDown={exitDownFromTop}
                    exitLeft={() => focus.setActiveChild("name")}
                    exitBackward={() => focus.setActiveChild("name")}
                    focus={focus.childFocus(props.config.kind)}
                />
            </div>
            <ul
                class="model-specializations"
                classList={{ "has-instantiated": props.config.hasInstantiated() != null }}
            >
                <Index each={props.instantiation?.specializations}>
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
                                instantiated={props.instantiated}
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
                <Show when={props.instantiated}>
                    <li
                        class="something-specialization-add"
                        onMouseDown={(evt) => {
                            appendSpecialization();
                            props.focus.setFocused(true);
                            evt.preventDefault();
                        }}
                    >
                        <div class="something-specialization">
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

type InstantiationCellComponent = "name" | string | "specializations";

export interface ObLookup {
    hasOb(ob: Ob): boolean;
    obGenerators(): QualifiedName[];
    obGeneratorLabel(id: QualifiedName): QualifiedLabel | undefined;
    obGeneratorWithLabel(label: QualifiedLabel): NameLookup;
    obType(ob: Ob): ObType;
}

export interface PickerConfig {
    kind: string;
    refId(): string | undefined;
    setRefId(refId: string | null): void;
    filterCompletions(refId: string, doc: DocInfo): boolean;
    hasInstantiated: Accessor<boolean>;
}

export interface SpecConfig {
    completions: Accessor<QualifiedName[] | undefined>;
    idToLavel(id: QualifiedName): Qua
}

export interface InstantiationConfig {
    kind: string;
    refId(): string | undefined;
    setRefId(refId: string | null): void;
    filterCompletions(refId: string, doc: DocInfo): boolean;
    /** Whether an instantiated doc has been resolved — drives the CSS class and add-row */
    hasInstantiated: Accessor<boolean>;

    // Id-side completions for specialization rows
    completions: Accessor<QualifiedName[] | undefined>;
    idToLabel(id: QualifiedName): QualifiedLabel | undefined;
    labelToId(label: QualifiedLabel): NameLookup | undefined;

    // Ob-side render prop
    obSide(
        props: {
            specialization: { id: string | null; ob: Ob | null };
            modifySpecialization: (f: (spec: { id: string | null; ob: Ob | null }) => void) => void;
            focus: FocusHandle;
        } & Pick<TextInputOptions, "createBelow" | "exitDown" | "exitUp">,
    ): JSX.Element;
}

function SpecializationEditor(
    allProps: {
        specialization: { id: string | null; ob: Ob | null };
        modifySpecialization: (f: (spec: { id: string | null; ob: Ob | null }) => void) => void;
        completions?: QualifiedName[];
        idToLabel: (id: QualifiedName) => QualifiedLabel | undefined;
        labelToId: (label: QualifiedLabel) => NameLookup | undefined;
        onIdTextChange?: (text: string) => void;
        obSide: (
            props: {
                specialization: { id: string | null; ob: Ob | null };
                modifySpecialization: (
                    f: (spec: { id: string | null; ob: Ob | null }) => void,
                ) => void;
                focus: FocusHandle;
                deleteBackward: () => void;
                exitBackward: () => void;
                exitLeft: () => void;
            } & Pick<TextInputOptions, "createBelow" | "exitDown" | "exitUp">,
        ) => JSX.Element;
        focus: FocusHandle;
    } & Pick<TextInputOptions, "createBelow" | "deleteBackward" | "exitDown" | "exitUp">,
) {
    const [inputProps, props] = splitProps(allProps, ["createBelow", "exitDown", "exitUp"]);

    // oxlint-disable-next-line solid/reactivity -- Focus handles are stable for a mounted row.
    const focus = useChildFocus<SpecializationEditorInput>(props.focus, { default: "id" });

    return (
        <div class="document-specialization">
            <IdInput
                placeholder="..."
                id={props.specialization.id}
                setId={(id) => {
                    props.modifySpecialization((spec) => {
                        spec.id = id;
                    });
                }}
                onTextChange={props.onIdTextChange}
                completions={props.completions}
                idToLabel={props.idToLabel}
                labelToId={props.labelToId}
                focus={focus.childFocus("id")}
                deleteBackward={props.deleteBackward}
                exitForward={() => focus.setActiveChild("ob")}
                exitRight={() => focus.setActiveChild("ob")}
                {...inputProps}
            />
            <span class="specialize-as" />
            {props.obSide({
                specialization: props.specialization,
                modifySpecialization: props.modifySpecialization,
                focus: focus.childFocus("ob"),
                deleteBackward: () => focus.setActiveChild("id"),
                exitBackward: () => focus.setActiveChild("id"),
                exitLeft: () => focus.setActiveChild("id"),
                ...inputProps,
            })}
        </div>
    );
}

type SpecializationEditorInput = "id" | "ob";
