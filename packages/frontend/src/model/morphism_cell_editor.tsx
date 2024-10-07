import { createEffect, useContext } from "solid-js";

import { InlineInput } from "../components";
import type { CellActions } from "../notebook";
import { ModelValidationContext, TheoryContext } from "./context";
import { ObInput } from "./object_input";
import type { MorphismDecl } from "./types";

import "./morphism_cell_editor.css";

/** Editor for a moprhism declaration cell in a model.
 */
export function MorphismCellEditor(props: {
    morphism: MorphismDecl;
    modifyMorphism: (f: (decl: MorphismDecl) => void) => void;
    isActive: boolean;
    actions: CellActions;
}) {
    let nameRef!: HTMLInputElement;
    let domRef!: HTMLInputElement;
    let codRef!: HTMLInputElement;

    createEffect(() => {
        if (props.isActive) {
            nameRef.focus();
            nameRef.selectionStart = nameRef.selectionEnd = nameRef.value.length;
        }
    });

    const theory = useContext(TheoryContext);
    const validationResult = useContext(ModelValidationContext);

    const morTypeMeta = () => theory?.()?.getMorTypeMeta(props.morphism.morType);
    const nameClasses = () => ["morphism-decl-name", ...(morTypeMeta()?.textClasses ?? [])];
    const arrowStyle = () => morTypeMeta()?.arrowStyle ?? "default";

    const morphismErrors = () => {
        const res = validationResult?.();
        if (res?.tag !== "errors") {
            return [];
        }
        return res.errors.get(props.morphism.id) ?? [];
    };

    return (
        <div class="model-judgment morphism-decl">
            <ObInput
                ref={domRef}
                placeholder="..."
                ob={props.morphism.dom}
                setOb={(ob) => {
                    props.modifyMorphism((mor) => {
                        mor.dom = ob;
                    });
                }}
                obType={theory?.()?.theory.src(props.morphism.morType)}
                invalid={morphismErrors().some((err) => err.tag === "Dom" || err.tag === "DomType")}
                deleteForward={() => nameRef.focus()}
                exitBackward={() => nameRef.focus()}
                exitForward={() => codRef.focus()}
                exitRight={() => nameRef.focus()}
                onFocus={props.actions.hasFocused}
            />
            <div class="morphism-decl-name-container">
                <div class={nameClasses().join(" ")}>
                    <InlineInput
                        ref={nameRef}
                        placeholder={morTypeMeta()?.preferUnnamed ? undefined : "Unnamed"}
                        text={props.morphism.name}
                        setText={(text) => {
                            props.modifyMorphism((mor) => {
                                mor.name = text;
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
                <div class={`morphism-decl-arrow-container ${arrowStyle()}`}>
                    <div class={`morphism-decl-arrow ${arrowStyle()}`} />
                </div>
            </div>
            <ObInput
                ref={codRef}
                placeholder="..."
                ob={props.morphism.cod}
                setOb={(ob) => {
                    props.modifyMorphism((mor) => {
                        mor.cod = ob;
                    });
                }}
                obType={theory?.()?.theory.tgt(props.morphism.morType)}
                invalid={morphismErrors().some((err) => err.tag === "Cod" || err.tag === "CodType")}
                deleteBackward={() => nameRef.focus()}
                exitBackward={() => domRef.focus()}
                exitForward={props.actions.activateBelow}
                exitLeft={() => nameRef.focus()}
                onFocus={props.actions.hasFocused}
            />
        </div>
    );
}
