import { Match, Switch, createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { NameInput } from "catcolab-ui-components";
import { LiveModelContext } from "./context";
import { ContributionMonomialEditor } from "./contribution_monomial_editor";
import { MorphismEditHandle } from "./edit_handle";
import type { MorphismEditorProps } from "./editors";
import { obClasses } from "./object_cell_editor";
import { ObInput } from "./object_input";

import styles from "./contribution_cell_editor.module.css";

/** The sign of a contribution: positive or negative. */
export type ContributionSign = "plus" | "minus";

/** Editor for a positive contribution declaration in a model. */
export const PositiveContributionCellEditor = (props: MorphismEditorProps) => (
    <ContributionCellEditor {...props} sign="plus" />
);

/** Editor for a negative contribution declaration in a model. */
export const NegativeContributionCellEditor = (props: MorphismEditorProps) => (
    <ContributionCellEditor {...props} sign="minus" />
);

/** Editor for a contribution declaration cell in a model. */
export default function ContributionCellEditor(
    props: MorphismEditorProps & { sign?: ContributionSign },
) {
    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    /* oxlint-disable solid/reactivity -- handle methods read props lazily */
    const mor = new MorphismEditHandle({
        theory: () => props.theory,
        morphism: () => props.morphism,
        modify: (f) => props.modifyMorphism(f),
        validated: () => liveModel().validatedModel(),
    });
    /* oxlint-enable solid/reactivity */

    const [activeInput, setActiveInput] = createSignal<MorphismCellInput>("name");

    const morTypeMeta = () => props.theory.modelMorTypeMeta(props.morphism.morType);

    const domClasses = () => ["morphism-decl-dom", ...obClasses(props.theory, mor.domType)];
    const codClasses = () => ["morphism-decl-cod", ...obClasses(props.theory, mor.codType)];

    const nameClasses = () => ["morphism-decl-name", ...(morTypeMeta()?.textClasses ?? [])];

    return (
        <div class={`formal-judgment ${styles["morphism-decl"]}`}>
            <div class={nameClasses().join(" ")}>
                <NameInput
                    placeholder={morTypeMeta()?.preferUnnamed ? undefined : "Unnamed"}
                    name={mor.name}
                    setName={mor.setName}
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
                    ob={mor.cod}
                    setOb={mor.setCod}
                    obType={mor.codType}
                    isInvalid={mor.hasCodError}
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
                <Switch fallback="+">
                    <Match when={props.sign === "plus"}>{"+"}</Match>
                    <Match when={props.sign === "minus"}>{"-"}</Match>
                </Switch>
                {"="}
            </div>
            <div class={styles["morphism-decl-dom-prefix"]}>𝜆&nbsp;&middot;</div>
            <div class={domClasses().join(" ")}>
                <ContributionMonomialEditor
                    placeholder="..."
                    ob={mor.dom}
                    setOb={mor.setDom}
                    obType={mor.domType}
                    isInvalid={mor.hasDomError}
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
