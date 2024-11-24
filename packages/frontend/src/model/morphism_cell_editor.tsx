import { createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { NameInput } from "../components";
import type { CellActions } from "../notebook";
import { focusInputWhen } from "../util/focus";
import { LiveModelContext } from "./context";
import { obClasses } from "./object_cell_editor";
import { ObInput } from "./object_input";
import type { MorphismDecl } from "./types";

import arrowStyles from "../stdlib/arrow_styles.module.css";
import "./morphism_cell_editor.css";

/** Editor for a moprhism declaration cell in a model.
 */
export function MorphismCellEditor(props: {
    morphism: MorphismDecl;
    modifyMorphism: (f: (decl: MorphismDecl) => void) => void;
    isActive: boolean;
    actions: CellActions;
}) {
    const [nameRef, setNameRef] = createSignal<HTMLInputElement>();
    let domRef!: HTMLInputElement;
    let codRef!: HTMLInputElement;
    focusInputWhen(nameRef, () => props.isActive);

    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");
    const theory = () => liveModel.theory();

    const domType = () => theory()?.theory.src(props.morphism.morType);
    const codType = () => theory()?.theory.tgt(props.morphism.morType);
    const domClasses = () => ["morphism-decl-dom", ...obClasses(theory(), domType())];
    const codClasses = () => ["morphism-decl-cod", ...obClasses(theory(), codType())];

    const morTypeMeta = () => theory()?.modelMorTypeMeta(props.morphism.morType);
    const nameClasses = () => [
        "morphism-decl-name",
        arrowStyles.arrowName,
        ...(morTypeMeta()?.textClasses ?? []),
    ];
    const arrowClass = () => arrowStyles[morTypeMeta()?.arrowStyle ?? "default"];

    const errors = () => {
        const validated = liveModel.validatedModel();
        if (validated?.result.tag !== "Err") {
            return [];
        }
        return validated.result.content.filter((err) => err.content === props.morphism.id);
    };

    return (
        <div class="formal-judgment morphism-decl">
            <div class={domClasses().join(" ")}>
                <ObInput
                    ref={domRef}
                    placeholder="..."
                    ob={props.morphism.dom}
                    setOb={(ob) => {
                        props.modifyMorphism((mor) => {
                            mor.dom = ob;
                        });
                    }}
                    obType={domType()}
                    invalid={errors().some((err) => err.tag === "Dom" || err.tag === "DomType")}
                    deleteForward={() => nameRef()?.focus()}
                    exitBackward={() => nameRef()?.focus()}
                    exitForward={() => codRef.focus()}
                    exitRight={() => nameRef()?.focus()}
                    onFocus={props.actions.hasFocused}
                />
            </div>
            <div class={arrowStyles.arrowWithName}>
                <div class={nameClasses().join(" ")}>
                    <NameInput
                        ref={setNameRef}
                        placeholder={morTypeMeta()?.preferUnnamed ? undefined : "Unnamed"}
                        name={props.morphism.name}
                        setName={(name) => {
                            props.modifyMorphism((mor) => {
                                mor.name = name;
                            });
                        }}
                        deleteBackward={props.actions.deleteBackward}
                        deleteForward={props.actions.deleteForward}
                        exitBackward={props.actions.activateAbove}
                        exitForward={() => domRef.focus()}
                        exitUp={props.actions.activateAbove}
                        exitDown={props.actions.activateBelow}
                        exitLeft={() => domRef.focus()}
                        exitRight={() => codRef.focus()}
                        onFocus={props.actions.hasFocused}
                    />
                </div>
                <div class={[arrowStyles.arrowContainer, arrowClass()].join(" ")}>
                    <div class={[arrowStyles.arrow, arrowClass()].join(" ")} />
                </div>
            </div>
            <div class={codClasses().join(" ")}>
                <ObInput
                    ref={codRef}
                    placeholder="..."
                    ob={props.morphism.cod}
                    setOb={(ob) => {
                        props.modifyMorphism((mor) => {
                            mor.cod = ob;
                        });
                    }}
                    obType={codType()}
                    invalid={errors().some((err) => err.tag === "Cod" || err.tag === "CodType")}
                    deleteBackward={() => nameRef()?.focus()}
                    exitBackward={() => domRef.focus()}
                    exitForward={props.actions.activateBelow}
                    exitLeft={() => nameRef()?.focus()}
                    onFocus={props.actions.hasFocused}
                />
            </div>
        </div>
    );
}
