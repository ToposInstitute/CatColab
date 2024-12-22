import { createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";
import { uuidv7 } from "uuidv7";

import { BasicMorInput } from "../model/morphism_input";
import type { CellActions } from "../notebook";
import { focusInputWhen } from "../util/focus";
import { LiveDiagramContext } from "./context";
import { BasicObInput } from "./object_input";
import type { DiagramMorphismDecl } from "./types";

import arrowStyles from "../stdlib/arrow_styles.module.css";
import "./morphism_cell_editor.css";

/** Editor for a morphism declaration cell in a diagram in a model.
 */
export function DiagramMorphismCellEditor(props: {
    decl: DiagramMorphismDecl;
    modifyDecl: (f: (decl: DiagramMorphismDecl) => void) => void;
    isActive: boolean;
    actions: CellActions;
}) {
    const [morRef, setMorRef] = createSignal<HTMLInputElement>();
    let domRef!: HTMLInputElement;
    let codRef!: HTMLInputElement;
    focusInputWhen(morRef, () => props.isActive);

    const liveDiagram = useContext(LiveDiagramContext);
    invariant(liveDiagram, "Live diagram should be provided as context");
    const theory = () => liveDiagram().liveModel.theory();

    const domType = () => theory()?.theory.src(props.decl.morType);
    const codType = () => theory()?.theory.tgt(props.decl.morType);

    const errors = () => {
        const validated = liveDiagram().validatedDiagram();
        if (validated?.result.tag !== "Err") {
            return [];
        }
        return validated.result.content.filter((err) => err.err.content === props.decl.id);
    };

    const domInvalid = (): boolean =>
        errors().some((err) => err.err.tag === "Dom" || err.err.tag === "DomType");
    const codInvalid = (): boolean =>
        errors().some((err) => err.err.tag === "Cod" || err.err.tag === "CodType");

    return (
        <div class="formal-judgment diagram-morphism-decl">
            <BasicObInput
                ref={domRef}
                placeholder="..."
                ob={props.decl.dom}
                setOb={(ob) => {
                    props.modifyDecl((decl) => {
                        decl.dom = ob;
                    });
                }}
                obType={domType()}
                generateId={uuidv7}
                invalid={domInvalid()}
                deleteForward={() => morRef()?.focus()}
                exitBackward={() => morRef()?.focus()}
                exitForward={() => codRef.focus()}
                exitRight={() => morRef()?.focus()}
                onFocus={props.actions.hasFocused}
            />
            <div class={arrowStyles.arrowWithName}>
                <div class={arrowStyles.arrowName}>
                    <BasicMorInput
                        ref={setMorRef}
                        mor={props.decl.over}
                        setMor={(mor) => {
                            props.modifyDecl((decl) => {
                                decl.over = mor;
                            });
                        }}
                        morType={props.decl.morType}
                        placeholder={theory()?.modelMorTypeMeta(props.decl.morType)?.name}
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
                <div class={[arrowStyles.arrowContainer, arrowStyles.default].join(" ")}>
                    <div class={[arrowStyles.arrow, arrowStyles.default].join(" ")} />
                </div>
            </div>
            <BasicObInput
                ref={codRef}
                placeholder="..."
                ob={props.decl.cod}
                setOb={(ob) => {
                    props.modifyDecl((decl) => {
                        decl.cod = ob;
                    });
                }}
                obType={codType()}
                generateId={uuidv7}
                invalid={codInvalid()}
                deleteBackward={() => morRef()?.focus()}
                exitBackward={() => domRef.focus()}
                exitForward={props.actions.activateBelow}
                exitLeft={() => morRef()?.focus()}
                onFocus={props.actions.hasFocused}
            />
        </div>
    );
}
