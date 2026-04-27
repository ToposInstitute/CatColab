import { createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { NameInput } from "catcolab-ui-components";
import { LiveModelContext } from "./context";
import { MorphismEditHandle } from "./edit_handle";
import type { MorphismEditorProps } from "./editors";
import { obClasses } from "./object_cell_editor";
import { ObInput } from "./object_input";

import arrowStyles from "../stdlib/arrow_styles.module.css";
import "./morphism_cell_editor.css";

/** Editor for a morphism declaration cell in a model. */
export default function MorphismCellEditor(props: MorphismEditorProps) {
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

    const nameClasses = () => [
        "morphism-decl-name",
        arrowStyles.arrowName,
        ...(morTypeMeta()?.textClasses ?? []),
    ];
    const arrowClass = () => arrowStyles[morTypeMeta()?.arrowStyle ?? "default"];

    return (
        <div class="formal-judgment morphism-decl">
            <div class={domClasses().join(" ")}>
                <ObInput
                    placeholder="..."
                    ob={mor.dom}
                    setOb={mor.setDom}
                    obType={mor.domType}
                    isInvalid={mor.hasDomError}
                    isActive={props.isActive && activeInput() === "dom"}
                    deleteForward={() => setActiveInput("name")}
                    exitBackward={() => setActiveInput("name")}
                    exitForward={() => setActiveInput("cod")}
                    exitRight={() => setActiveInput("name")}
                    hasFocused={() => {
                        setActiveInput("dom");
                        props.actions.hasFocused?.();
                    }}
                />
            </div>
            <div class={arrowStyles.arrowWithName}>
                <div class={nameClasses().join(" ")}>
                    <NameInput
                        placeholder={morTypeMeta()?.preferUnnamed ? undefined : "Unnamed"}
                        name={mor.name}
                        setName={mor.setName}
                        isActive={props.isActive && activeInput() === "name"}
                        deleteBackward={props.actions.deleteBackward}
                        deleteForward={props.actions.deleteForward}
                        exitBackward={props.actions.activateAbove}
                        exitForward={() => setActiveInput("dom")}
                        exitUp={props.actions.activateAbove}
                        exitDown={props.actions.activateBelow}
                        exitLeft={() => setActiveInput("dom")}
                        exitRight={() => setActiveInput("cod")}
                        hasFocused={() => {
                            setActiveInput("name");
                            props.actions.hasFocused?.();
                        }}
                    />
                </div>
                <div class={[arrowStyles.arrowContainer, arrowClass()].join(" ")}>
                    <div class={[arrowStyles.arrow, arrowClass()].join(" ")} />
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
                    deleteBackward={() => setActiveInput("name")}
                    exitBackward={() => setActiveInput("dom")}
                    exitForward={props.actions.activateBelow}
                    exitLeft={() => setActiveInput("name")}
                    hasFocused={() => {
                        setActiveInput("cod");
                        props.actions.hasFocused?.();
                    }}
                />
            </div>
        </div>
    );
}

type MorphismCellInput = "name" | "dom" | "cod";
