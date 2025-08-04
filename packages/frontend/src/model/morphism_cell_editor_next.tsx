import { createMemo, createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { InlineInput, NameInput } from "../components";
import type { CellActions } from "../notebook";
import { LiveModelContext } from "./context";
import { obClasses } from "./object_cell_editor";
import { ObInput } from "./object_input";
import type { MorphismDeclNext } from "./types";

import arrowStyles from "../stdlib/arrow_styles.module.css";
import "./morphism_cell_editor.css";

/** Editor for a moprhism declaration cell in a model.
 */
export function MorphismCellEditorNext(props: {
    morphism: MorphismDeclNext;
    modifyMorphism: (f: (decl: MorphismDeclNext) => void) => void;
    isActive: boolean;
    actions: CellActions;
}) {
    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    const [activeInput, setActiveInput] = createSignal<MorphismCellInput>("name");

    const theory = () => liveModel().theory();
    const morTypeMeta = () => theory().modelMorTypeMeta(props.morphism.morType);

    const domType = createMemo(() => {
        const op = morTypeMeta()?.domain?.apply;
        if (op === undefined) {
            return theory().theory.src(props.morphism.morType);
        } else {
            // Codomain type for operation should equal source type above.
            return theory().theory.dom(op);
        }
    });

    const codType = createMemo(() => {
        const op = morTypeMeta()?.codomain?.apply;
        if (op === undefined) {
            return theory().theory.tgt(props.morphism.morType);
        } else {
            // Codomain type for operation should equal target type above.
            return theory().theory.dom(op);
        }
    });

    const domClasses = () => ["morphism-decl-dom", ...obClasses(theory(), domType())];
    const codClasses = () => ["morphism-decl-cod", ...obClasses(theory(), codType())];

    const nameClasses = () => [
        "morphism-decl-name",
        arrowStyles.arrowName,
        ...(morTypeMeta()?.textClasses ?? []),
    ];
    const arrowClass = () => arrowStyles[morTypeMeta()?.arrowStyle ?? "default"];

    const errors = () => {
        const validated = liveModel().validatedModel();
        if (validated?.result.tag !== "Err") {
            return [];
        }
        return validated.result.content.filter((err) => err.content === props.morphism.id);
    };

    return (
        <div class="formal-judgment morphism-decl">
            <div class={domClasses().join(" ")}>
                <InlineInput
                    placeholder="..."
                    text={props.morphism.dom}
                    setText={(ob) => {
                        props.modifyMorphism((mor) => {
                            mor.dom = ob;
                        });
                    }}
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
                <InlineInput
                    placeholder="..."
                    text={props.morphism.cod}
                    setText={(ob) => {
                        props.modifyMorphism((mor) => {
                            mor.cod = ob;
                        });
                    }}
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
