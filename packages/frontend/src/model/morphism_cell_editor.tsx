import { createMemo, createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { NameInput } from "catcolab-ui-components";
import type { MorDecl } from "catlog-wasm";
import type { CellActions } from "../notebook";
import arrowStyles from "../stdlib/arrow_styles.module.css";
import type { Theory } from "../theory";
import { LiveModelContext } from "./context";
import { obClasses } from "./object_cell_editor";
import { ObInput } from "./object_input";
import "./morphism_cell_editor.css";

/** Editor for a morphism declaration cell in a model. */
export function MorphismCellEditor(props: {
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
        let result: ReturnType<typeof theory.src>;
        if (op === undefined) {
            result = theory.src(props.morphism.morType);
        } else {
            // Codomain type for operation should equal source type above.
            result = theory.dom(op);
        }
        console.log("[MorphismCellEditor] domType computed", {
            morType: props.morphism.morType,
            domainApplyOp: op,
            result,
        });
        return result;
    });

    const codType = createMemo(() => {
        const theory = props.theory.theory;
        const op = morTypeMeta()?.codomain?.apply;
        let result: ReturnType<typeof theory.tgt>;
        if (op === undefined) {
            result = theory.tgt(props.morphism.morType);
        } else {
            // Codomain type for operation should equal target type above.
            result = theory.dom(op);
        }
        console.log("[MorphismCellEditor] codType computed", {
            morType: props.morphism.morType,
            codomainApplyOp: op,
            result,
        });
        return result;
    });

    const domClasses = () => ["morphism-decl-dom", ...obClasses(props.theory, domType())];
    const codClasses = () => ["morphism-decl-cod", ...obClasses(props.theory, codType())];

    const nameClasses = () => [
        "morphism-decl-name",
        arrowStyles.arrowName,
        ...(morTypeMeta()?.textClasses ?? []),
    ];
    const arrowClass = () => arrowStyles[morTypeMeta()?.arrowStyle ?? "default"];

    const errors = () => {
        const validated = liveModel().validatedModel();
        if (validated?.tag !== "Invalid") {
            return [];
        }
        return validated.errors.filter((err) => err.content === props.morphism.id);
    };

    return (
        <div class="formal-judgment morphism-decl">
            <div class={domClasses().join(" ")}>
                <ObInput
                    placeholder="..."
                    ob={props.morphism.dom}
                    setOb={(ob) => {
                        console.log("[MorphismCellEditor] Setting dom", {
                            morphismId: props.morphism.id,
                            morphismName: props.morphism.name,
                            previousDom: props.morphism.dom,
                            newDom: ob,
                        });
                        props.modifyMorphism((mor) => {
                            mor.dom = ob;
                        });
                    }}
                    obType={domType()}
                    applyOp={morTypeMeta()?.domain?.apply}
                    isInvalid={errors().some((err) => err.tag === "Dom" || err.tag === "DomType")}
                    isActive={props.isActive && activeInput() === "dom"}
                    deleteForward={() => setActiveInput("name")}
                    exitBackward={() => setActiveInput("name")}
                    exitForward={() => setActiveInput("cod")}
                    exitRight={() => setActiveInput("name")}
                    hasFocused={() => {
                        console.log("[MorphismCellEditor] Dom input focused", {
                            morphismId: props.morphism.id,
                            morphismName: props.morphism.name,
                            currentDom: props.morphism.dom,
                        });
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
                <ObInput
                    placeholder="..."
                    ob={props.morphism.cod}
                    setOb={(ob) => {
                        console.log("[MorphismCellEditor] Setting cod", {
                            morphismId: props.morphism.id,
                            morphismName: props.morphism.name,
                            previousCod: props.morphism.cod,
                            newCod: ob,
                        });
                        props.modifyMorphism((mor) => {
                            mor.cod = ob;
                        });
                    }}
                    obType={codType()}
                    applyOp={morTypeMeta()?.codomain?.apply}
                    isInvalid={errors().some((err) => err.tag === "Cod" || err.tag === "CodType")}
                    isActive={props.isActive && activeInput() === "cod"}
                    deleteBackward={() => setActiveInput("name")}
                    exitBackward={() => setActiveInput("dom")}
                    exitForward={props.actions.activateBelow}
                    exitLeft={() => setActiveInput("name")}
                    hasFocused={() => {
                        console.log("[MorphismCellEditor] Cod input focused", {
                            morphismId: props.morphism.id,
                            morphismName: props.morphism.name,
                            currentCod: props.morphism.cod,
                        });
                        setActiveInput("cod");
                        props.actions.hasFocused?.();
                    }}
                />
            </div>
        </div>
    );
}

type MorphismCellInput = "name" | "dom" | "cod";
