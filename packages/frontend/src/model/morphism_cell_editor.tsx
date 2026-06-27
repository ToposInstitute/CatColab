import { createMemo, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { NameInput, useChildFocus } from "catcolab-ui-components";
import { removeProxyAndCopy } from "../util/remove_proxy_and_copy";
import { LiveModelContext } from "./context";
import type { MorphismEditorProps } from "./editors";
import { obClasses } from "./object_cell_editor";
import { ObInput } from "./object_input";

import arrowStyles from "../stdlib/arrow_styles.module.css";
import "./morphism_cell_editor.css";

/** Editor for a morphism declaration cell in a model. */
export default function MorphismCellEditor(props: MorphismEditorProps) {
    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    // oxlint-disable-next-line solid/reactivity -- Focus handles are stable for a mounted cell.
    const focus = useChildFocus<MorphismCellInput>(props.focus, { default: "name" });

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
                        props.modifyMorphism((mor) => {
                            mor.dom = removeProxyAndCopy(ob);
                        });
                    }}
                    obType={domType()}
                    applyOp={morTypeMeta()?.domain?.apply}
                    isInvalid={errors().some((err) => err.tag === "Dom" || err.tag === "DomType")}
                    focus={focus.childFocus("dom")}
                    deleteForward={() => focus.setActiveChild("name")}
                    exitBackward={() => focus.setActiveChild("name")}
                    exitForward={() => focus.setActiveChild("cod")}
                    exitRight={() => focus.setActiveChild("name")}
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
                        focus={focus.childFocus("name")}
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
                <div class={[arrowStyles.arrowContainer, arrowClass()].join(" ")}>
                    <div class={[arrowStyles.arrow, arrowClass()].join(" ")} />
                </div>
            </div>
            <div class={codClasses().join(" ")}>
                <ObInput
                    placeholder="..."
                    ob={props.morphism.cod}
                    setOb={(ob) => {
                        props.modifyMorphism((mor) => {
                            mor.cod = removeProxyAndCopy(ob);
                        });
                    }}
                    obType={codType()}
                    applyOp={morTypeMeta()?.codomain?.apply}
                    isInvalid={errors().some((err) => err.tag === "Cod" || err.tag === "CodType")}
                    focus={focus.childFocus("cod")}
                    deleteBackward={() => focus.setActiveChild("name")}
                    exitBackward={() => focus.setActiveChild("dom")}
                    exitForward={props.actions.activateBelow}
                    exitLeft={() => focus.setActiveChild("name")}
                />
            </div>
        </div>
    );
}

type MorphismCellInput = "name" | "dom" | "cod";
