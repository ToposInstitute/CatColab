import { createMemo, createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { NameInput } from "catcolab-ui-components";
import type { Ob } from "catlog-wasm";
import { LiveModelContext } from "./context";
import { ContributionMonomialEditor } from "./contribution_monomial_editor";
import type { MorphismEditorProps } from "./editors";
import { unwrapApp, wrapApp } from "./ob_operations";
import { obClasses } from "./object_cell_editor";
import { ObInput } from "./object_input";

import "./contribution_cell_editor.css";

/** Editor for a contribution declaration cell in a model. */
export default function ContributionCellEditor(props: MorphismEditorProps) {
    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    const [activeInput, setActiveInput] = createSignal<MorphismCellInput>("name");

    const morTypeMeta = () => props.theory.modelMorTypeMeta(props.morphism.morType);

    const domType = createMemo(() => {
        const theory = props.theory.theory;
        const op = morTypeMeta()?.domain?.apply;
        if (op === undefined) {
            return theory.src(props.morphism.morType);
        } else {
            // Codomain type for operation should equal source type above.
            return theory.dom(op);
        }
    });

    const codType = createMemo(() => {
        const theory = props.theory.theory;
        const op = morTypeMeta()?.codomain?.apply;
        if (op === undefined) {
            return theory.tgt(props.morphism.morType);
        } else {
            // Codomain type for operation should equal target type above.
            return theory.dom(op);
        }
    });

    const domClasses = () => ["morphism-decl-dom", ...obClasses(props.theory, domType())];
    const codClasses = () => ["morphism-decl-cod", ...obClasses(props.theory, codType())];

    const nameClasses = () => ["morphism-decl-name", ...(morTypeMeta()?.textClasses ?? [])];

    const errors = () => {
        const validated = liveModel().validatedModel();
        if (validated?.tag !== "Invalid") {
            return [];
        }
        return validated.errors.filter((err) => err.content === props.morphism.id);
    };

    const domApplyOp = () => morTypeMeta()?.domain?.apply;

    const domOb = () => {
        const op = domApplyOp();
        return op ? unwrapApp(props.morphism.dom, op) : props.morphism.dom;
    };

    const setDomOb = (ob: Ob | null) => {
        const op = domApplyOp();
        const wrapped = ob && op ? wrapApp(ob, op) : ob;
        props.modifyMorphism((mor) => {
            mor.dom = wrapped;
        });
    };

    return (
        <div class="formal-judgment morphism-decl">
            <div class={nameClasses().join(" ")}>
                <NameInput
                    placeholder={morTypeMeta()?.preferUnnamed ? undefined : "Unnamed"}
                    name={props.morphism.name}
                    setName={(name) => {
                        props.modifyMorphism((mor) => {
                            mor.name = name;
                        });
                    }}
                    isActive={props.isActive && activeInput() === "name"}
                    deleteBackward={props.actions.deleteBackward}
                    deleteForward={props.actions.deleteForward}
                    exitBackward={props.actions.activateAbove}
                    exitForward={() => setActiveInput("cod")}
                    exitUp={props.actions.activateAbove}
                    exitDown={props.actions.activateBelow}
                    exitLeft={() => setActiveInput("cod")}
                    exitRight={() => setActiveInput("dom")}
                    hasFocused={() => {
                        setActiveInput("name");
                        props.actions.hasFocused?.();
                    }}
                />
            </div>
            <div class="morphism-decl-name-separator">:</div>
            <div class="morphism-decl-cod-prefix">
                <div class="fraction-numerator">d</div>
                <div class="fraction-denominator">dt</div>
            </div>
            <div class={codClasses().join(" ")}>
                <ObInput
                    placeholder="..."
                    ob={props.morphism.cod}
                    setOb={(ob) => {
                        props.modifyMorphism((mor) => {
                            mor.cod = ob;
                        });
                    }}
                    obType={codType()}
                    applyOp={morTypeMeta()?.codomain?.apply}
                    isInvalid={errors().some((err) => err.tag === "Cod" || err.tag === "CodType")}
                    isActive={props.isActive && activeInput() === "cod"}
                    deleteForward={() => setActiveInput("name")}
                    exitBackward={props.actions.activateAbove}
                    exitForward={() => setActiveInput("dom")}
                    exitLeft={() => setActiveInput("name")}
                    hasFocused={() => {
                        setActiveInput("cod");
                        props.actions.hasFocused?.();
                    }}
                />
            </div>
            <div class="morphism-decl-arrow-replacement">+=</div>
            <div class={domClasses().join(" ")}>
                <ContributionMonomialEditor
                    placeholder="..."
                    ob={domOb()}
                    setOb={setDomOb}
                    obType={domType()}
                    isInvalid={errors().some((err) => err.tag === "Dom" || err.tag === "DomType")}
                    isActive={props.isActive && activeInput() === "dom"}
                    deleteBackward={() => setActiveInput("name")}
                    exitBackward={() => setActiveInput("name")}
                    exitForward={props.actions.activateBelow}
                    exitRight={props.actions.activateBelow}
                    hasFocused={() => {
                        setActiveInput("dom");
                        props.actions.hasFocused?.();
                    }}
                />
            </div>
        </div>
    );
}

type MorphismCellInput = "name" | "dom" | "cod";
