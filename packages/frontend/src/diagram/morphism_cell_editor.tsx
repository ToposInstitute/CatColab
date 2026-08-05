import { useContext } from "solid-js";
import invariant from "tiny-invariant";

import { type FocusHandle, useChildFocus } from "catcolab-ui-components";
import type { DiagramMorDecl } from "catlog-wasm";
import { BasicMorInput } from "../model/morphism_input";
import type { CellActions } from "../notebook";
import type { Theory } from "../theory";
import { LiveDiagramContext } from "./context";
import { ObInput } from "./object_input";

import arrowStyles from "../stdlib/arrow_styles.module.css";
import "./morphism_cell_editor.css";

/** Editor for a morphism declaration cell in a diagram in a model. */
export function DiagramMorphismCellEditor(props: {
    decl: DiagramMorDecl;
    modifyDecl: (f: (decl: DiagramMorDecl) => void) => void;
    focus: FocusHandle;
    actions: CellActions;
    theory: Theory;
}) {
    const liveDiagram = useContext(LiveDiagramContext);
    invariant(liveDiagram, "Live diagram should be provided as context");

    // oxlint-disable-next-line solid/reactivity -- Focus handles are stable for a mounted cell.
    const focus = useChildFocus<DiagramMorphismCellInput>(props.focus, { default: "mor" });

    const domType = () => props.theory.theory.src(props.decl.morType);
    const codType = () => props.theory.theory.tgt(props.decl.morType);

    const errors = () => {
        const validated = liveDiagram().validatedDiagram();
        if (validated?.tag !== "Invalid") {
            return [];
        }
        return validated.errors.filter((err) => err.err.content === props.decl.id);
    };

    const domInvalid = (): boolean =>
        errors().some((err) => err.err.tag === "Dom" || err.err.tag === "DomType");
    const codInvalid = (): boolean =>
        errors().some((err) => err.err.tag === "Cod" || err.err.tag === "CodType");

    return (
        <div class="formal-judgment diagram-morphism-decl">
            <ObInput
                placeholder="..."
                ob={props.decl.dom}
                setOb={(ob) => {
                    props.modifyDecl((decl) => {
                        decl.dom = ob;
                    });
                }}
                obType={domType()}
                isInvalid={domInvalid()}
                focus={focus.childFocus("dom")}
                deleteForward={() => focus.setActiveChild("mor")}
                exitBackward={() => focus.setActiveChild("mor")}
                exitForward={() => focus.setActiveChild("cod")}
                exitRight={() => focus.setActiveChild("mor")}
            />
            <div class={arrowStyles.arrowWithName}>
                <div class={arrowStyles.arrowName}>
                    <BasicMorInput
                        mor={props.decl.over}
                        setMor={(mor) => {
                            props.modifyDecl((decl) => {
                                decl.over = mor;
                            });
                        }}
                        morType={props.decl.morType}
                        placeholder={props.theory.modelMorTypeMeta(props.decl.morType)?.name}
                        focus={focus.childFocus("mor")}
                        deleteBackward={props.actions.deleteBackward}
                        deleteForward={props.actions.deleteForward}
                        exitBackward={props.actions.activateAbove}
                        exitForward={() => focus.setActiveChild("dom")}
                        exitUp={props.actions.activateAbove}
                        exitDown={props.actions.activateBelow}
                        exitLeft={() => focus.setActiveChild("dom")}
                        exitRight={() => focus.setActiveChild("cod")}
                    />
                </div>
                <div class={[arrowStyles.arrowContainer, arrowStyles.default].join(" ")}>
                    <div class={[arrowStyles.arrow, arrowStyles.default].join(" ")} />
                </div>
            </div>
            <ObInput
                placeholder="..."
                ob={props.decl.cod}
                setOb={(ob) => {
                    props.modifyDecl((decl) => {
                        decl.cod = ob;
                    });
                }}
                obType={codType()}
                isInvalid={codInvalid()}
                focus={focus.childFocus("cod")}
                deleteBackward={() => focus.setActiveChild("mor")}
                exitBackward={() => focus.setActiveChild("dom")}
                exitForward={props.actions.activateBelow}
                exitLeft={() => focus.setActiveChild("mor")}
            />
        </div>
    );
}

type DiagramMorphismCellInput = "mor" | "dom" | "cod";
