import type { Component } from "solid-js";
import { createMemo, createSignal, Show, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { NameInput } from "catcolab-ui-components";
import type { Ob } from "catlog-wasm";
import { LiveModelContext } from "./context";
import { ContributionMonomialEditor } from "./contribution_monomial_editor";
import type { MorphismEditorProps } from "./editors";
import { unwrapApp, wrapApp } from "./ob_operations";
import { obClasses } from "./object_cell_editor";
import { ObInput } from "./object_input";

import styles from "./contribution_cell_editor.module.css";

/** The sign of a contribution: positive or negative. */
export type ContributionSign = "plus" | "minus";

/** Creates a contribution editor component with the given sign. */
export function createContributionEditor({
    sign,
}: {
    sign: ContributionSign;
}): Component<MorphismEditorProps> {
    return (props: MorphismEditorProps) => <ContributionCellEditor {...props} sign={sign} />;
}

/** Editor for a contribution declaration cell in a model. */
export default function ContributionCellEditor(
    props: MorphismEditorProps & { sign: ContributionSign },
) {
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
        <div class={`formal-judgment ${styles["morphism-decl"]}`}>
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
            <div class={styles["morphism-decl-name-separator"]}>:</div>
            <div class={styles["morphism-decl-cod-prefix"]}>
                <div class={styles["fraction"]}>
                    <div>d</div>
                    <div class={styles["fraction-denominator"]}>dt</div>
                </div>
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
            <div class={styles["morphism-decl-arrow-replacement"]}>
                <Show when={props.sign === "plus"}>+</Show>
                <Show when={props.sign === "minus"}>-</Show>=
            </div>
            <div class={styles["morphism-decl-dom-prefix"]}>𝜆&nbsp;&middot;</div>
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
