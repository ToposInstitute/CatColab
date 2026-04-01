import { createMemo, createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { NameInput } from "catcolab-ui-components";
import type { MorDecl } from "catlog-wasm";
import type { CellActions } from "../notebook";
import type { Theory } from "../theory";
import { LiveModelContext } from "./context";
import { obClasses } from "./object_cell_editor";
import { ObInput } from "./object_input";

import arrowStyles from "../stdlib/arrow_styles.module.css";
import "./morphism_cell_editor.css";

/** Editor for a morphism declaration cell with reversed arrow direction.

Renders as: codomain <—— name —— domain

The underlying data model is unchanged: `mor.dom` is still the domain and
`mor.cod` is still the codomain. Only the visual layout is swapped.
 */
export default function ReversedMorphismCellEditor(props: {
    morphism: MorDecl;
    modifyMorphism: (f: (decl: MorDecl) => void) => void;
    isActive: boolean;
    actions: CellActions;
    theory: Theory;
}) {
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
            return theory.dom(op);
        }
    });

    const codType = createMemo(() => {
        const theory = props.theory.theory;
        const op = morTypeMeta()?.codomain?.apply;
        if (op === undefined) {
            return theory.tgt(props.morphism.morType);
        } else {
            return theory.dom(op);
        }
    });

    // Visual layout is reversed: codomain on the left, domain on the right.
    const leftClasses = () => ["morphism-decl-dom", ...obClasses(props.theory, codType())];
    const rightClasses = () => ["morphism-decl-cod", ...obClasses(props.theory, domType())];

    const nameClasses = () => [
        "morphism-decl-name",
        arrowStyles.arrowName,
        ...(morTypeMeta()?.textClasses ?? []),
    ];

    const errors = () => {
        const validated = liveModel().validatedModel();
        if (validated?.tag !== "Invalid") {
            return [];
        }
        return validated.errors.filter((err) => err.content === props.morphism.id);
    };

    return (
        <div class="formal-judgment morphism-decl">
            <div class={leftClasses().join(" ")}>
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
                    exitBackward={() => setActiveInput("name")}
                    exitForward={() => setActiveInput("dom")}
                    exitRight={() => setActiveInput("name")}
                    hasFocused={() => {
                        setActiveInput("cod");
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
                <div class={[arrowStyles.arrowContainer, arrowStyles.reversed].join(" ")}>
                    <div class={[arrowStyles.arrow, arrowStyles.reversed].join(" ")} />
                </div>
            </div>
            <div class={rightClasses().join(" ")}>
                <ObInput
                    placeholder="..."
                    ob={props.morphism.dom}
                    setOb={(ob) => {
                        props.modifyMorphism((mor) => {
                            mor.dom = ob;
                        });
                    }}
                    obType={domType()}
                    applyOp={morTypeMeta()?.domain?.apply}
                    isInvalid={errors().some((err) => err.tag === "Dom" || err.tag === "DomType")}
                    isActive={props.isActive && activeInput() === "dom"}
                    deleteBackward={() => setActiveInput("name")}
                    exitBackward={() => setActiveInput("cod")}
                    exitForward={props.actions.activateBelow}
                    exitLeft={() => setActiveInput("name")}
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
