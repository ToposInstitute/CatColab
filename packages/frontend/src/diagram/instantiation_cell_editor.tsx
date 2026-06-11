import type { DocInfo } from "catcolab-api/src/user_state";
import { batch, createEffect, Index, Show, splitProps, untrack, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { Nb } from "catcolab-document-methods";
import {
    type FocusHandle,
    NameInput,
    type TextInputOptions,
    useChildFocus,
} from "catcolab-ui-components";
import type { DblDiagram, InstantiatedDiagram, Ob, SpecializeDiagram } from "catlog-wasm";
import { useApi } from "../api";
import { DocumentPicker, IdInput, IdInputPlaceholder } from "../components";
import type { CellActions } from "../notebook";
import { DocRefIdContext } from "../page/context";
import { useUserState } from "../user/user_state_context";
import { LiveDiagramContext, DiagramLibraryContext } from "./context";
import { ObInput } from "./object_input";

import "./instantiation_cell_editor.css";

/** Editor for an instantiation cell in a model */
export function InstantiationCellEditor(props: {
    instantiation: InstantiatedDiagram;
    modifyInstantiation: (f: (inst: InstantiatedDiagram) => void) => void;
    focus: FocusHandle;
    actions: CellActions;
}) {
    const api = useApi();
    const docRefId = useContext(DocRefIdContext);
    const liveDiagram = useContext(LiveDiagramContext);
    const userState = useUserState();

    const filterCompletions = (refId: string, doc: DocInfo) => {
        if (doc.typeName !== "diagram") {
            return false;
        }
        if (docRefId && refId === docRefId()) {
            return false;
        }
        const theory = liveDiagram?.().liveDoc.doc.theory;
        if (theory && doc.theory !== theory) {
            return false;
        }
        return true;
    };

    const refId = () => props.instantiation.diagram?._id;
    const setRefId = (refId: string | null) => {
        props.modifyInstantiation((inst) => {
            inst.diagram = refId ? api.makeUnversionedLink(refId, "instantiation") : null;
            // Auto-fill the name from the selected model's title when unnamed.
            if (refId && !inst.name) {
                const docName = userState.documents[refId]?.name;
                if (docName) {
                    inst.name = docName;
                }
            }
        });
    };

    const diagrams = useContext(DiagramLibraryContext);
    invariant(diagrams);
    const instantiated = diagrams.useLiveDiagram(refId);

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

    const instantiatedJudgments = (): DiagramJudgment[] => {
        const live = instantiated();
        if (!live) return [];
        return Nb.getFormalContent(live.liveDoc.doc.notebook);
    };

    const obJudgments = () => instantiatedJudgments().filter((j) => j.tag === "object");

    const obGenerators = () => obJudgments().map((j) => j.id);

    const obIdToLabel = (id: string): string[] | undefined => {
        const j = obJudgments().find((j) => j.id === id);
        return j?.name ? [j.name] : undefined;
    };

    const obLabelToId = (label: string[]) => {
        const name = label[0];
        const matches = obJudgments().filter((j) => j.name === name);
        if (matches.length === 1) return { tag: "Unique" as const, content: matches[0].id };
        if (matches.length > 1) return { tag: "Ambiguous" as const };
        return { tag: "None" as const };
    };

    const currentJudgments = (): DiagramJudgment[] => {
        const live = liveDiagram?.();
        if (!live) return [];
        return Nb.getFormalContent(live.liveDoc.doc.notebook);
    };

    const currentObJudgments = () => currentJudgments().filter((j) => j.tag === "object");
    const currentObGenerators = () => currentObJudgments().map((j) => j.id);
    const currentObIdToLabel = (id: string): string[] | undefined => {
        const j = currentObJudgments().find((j) => j.id === id);
        return j?.name ? [j.name] : undefined;
    };
    const currentObLabelToId = (label: string[]) => {
        const name = label[0];
        const matches = currentObJudgments().filter((j) => j.name === name);
        if (matches.length === 1) return { tag: "Unique" as const, content: matches[0].id };
        if (matches.length > 1) return { tag: "Ambiguous" as const };
        return { tag: "None" as const };
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
                                completions={obGenerators()}
                                idToLabel={obIdToLabel}
                                labelToId={obLabelToId}
                                currentCompletions={currentObGenerators()}
                                currentIdToLabel={currentObIdToLabel}
                                currentLabelToId={currentObLabelToId}
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
        specialization: SpecializeDiagram;
        modifySpecialization: (f: (spec: SpecializeDiagram) => void) => void;
        completions?: string[];
        idToLabel: (id: string) => string[] | undefined;
        labelToId: (label: string[]) => NameLookup | undefined;
        /** Called when the displayed text of the id input changes. */
        currentCompletions?: string[];
        currentIdToLabel: (id: string) => string[] | undefined;
        currentLabelToId: (label: string[]) => NameLookup | undefined;
        onIdTextChange?: (text: string) => void;
        focus: FocusHandle;
    } & Pick<TextInputOptions, "createBelow" | "deleteBackward" | "exitDown" | "exitUp">,
) {
    const [inputProps, props] = splitProps(allProps, ["createBelow", "exitDown", "exitUp"]);

    // oxlint-disable-next-line solid/reactivity -- Focus handles are stable for a mounted row.
    const focus = useChildFocus<SpecializationEditorInput>(props.focus, { default: "id" });

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
            <IdInput
                placeholder="..."
                id={
                    props.specialization.ob?.tag === "Basic"
                        ? props.specialization.ob.content
                        : null
                }
                setId={(id) => {
                    props.modifySpecialization((spec) => {
                        spec.ob = id ? { tag: "Basic", content: id } : null;
                    });
                }}
                completions={props.currentCompletions}
                idToLabel={props.currentIdToLabel}
                labelToId={props.currentLabelToId}
                focus={focus.childFocus("ob")}
                deleteBackward={() => focus.setActiveChild("id")}
                exitBackward={() => focus.setActiveChild("id")}
                exitLeft={() => focus.setActiveChild("id")}
                {...inputProps}
            />
        </div>
    );
}

type SpecializationEditorInput = "id" | "ob";
