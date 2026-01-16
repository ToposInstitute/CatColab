import { Match, Switch, createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";
import { v7 } from "uuid";

import type { DiagramMorDecl } from "catlog-wasm";
import { BasicMorInput } from "../model/morphism_input";
import type { CellActions } from "../notebook";
import arrowStyles from "../stdlib/arrow_styles.module.css";
import type { Theory } from "../theory";
import { LiveDiagramContext } from "./context";
import { LiteralInput } from "./literal_input";
import { BasicObInput } from "./object_input";
import "./morphism_cell_editor.css";

/** Editor for a morphism declaration cell in a diagram in a model. */
export function DiagramMorphismCellEditor(props: {
    decl: DiagramMorDecl;
    modifyDecl: (f: (decl: DiagramMorDecl) => void) => void;
    isActive: boolean;
    actions: CellActions;
    theory: Theory;
}) {
    const liveDiagram = useContext(LiveDiagramContext);
    invariant(liveDiagram, "Live diagram should be provided as context");

    const [activeInput, setActiveInput] = createSignal<DiagramMorphismCellInput>("mor");

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
            <BasicObInput
                placeholder="..."
                ob={props.decl.dom}
                setOb={(ob) => {
                    props.modifyDecl((decl) => {
                        decl.dom = ob;
                    });
                }}
                obType={domType()}
                generateId={v7}
                isInvalid={domInvalid()}
                isActive={props.isActive && activeInput() === "dom"}
                deleteForward={() => setActiveInput("mor")}
                exitBackward={() => setActiveInput("mor")}
                exitForward={() => setActiveInput("cod")}
                exitRight={() => setActiveInput("mor")}
                hasFocused={() => {
                    setActiveInput("dom");
                    props.actions.hasFocused?.();
                }}
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
                        isActive={props.isActive && activeInput() === "mor"}
                        deleteBackward={props.actions.deleteBackward}
                        deleteForward={props.actions.deleteForward}
                        exitBackward={props.actions.activateAbove}
                        exitForward={() => setActiveInput("dom")}
                        exitUp={props.actions.activateAbove}
                        exitDown={props.actions.activateBelow}
                        exitLeft={() => setActiveInput("dom")}
                        exitRight={() => setActiveInput("cod")}
                        hasFocused={() => {
                            setActiveInput("mor");
                            props.actions.hasFocused?.();
                        }}
                    />
                </div>
                <div class={[arrowStyles.arrowContainer, arrowStyles.default].join(" ")}>
                    <div class={[arrowStyles.arrow, arrowStyles.default].join(" ")} />
                </div>
            </div>
            <Switch>
                {/* Use LiteralInput for Attr morphisms (attributes have literal codomains) */}
                <Match when={props.decl.morType?.tag === "Basic" && props.decl.morType?.content === "Attr"}>
                    <LiteralInput
                        ob={props.decl.cod}
                        setOb={(ob) => {
                            props.modifyDecl((decl) => {
                                decl.cod = ob;
                            });
                        }}
                        placeholder="value..."
                        isInvalid={codInvalid()}
                        isActive={props.isActive && activeInput() === "cod"}
                        deleteBackward={() => setActiveInput("mor")}
                        exitBackward={() => setActiveInput("dom")}
                        exitForward={props.actions.activateBelow}
                        exitLeft={() => setActiveInput("mor")}
                        hasFocused={() => {
                            setActiveInput("cod");
                            props.actions.hasFocused?.();
                        }}
                    />
                </Match>
                <Match when={true}>
                    <BasicObInput
                        placeholder="..."
                        ob={props.decl.cod}
                        setOb={(ob) => {
                            props.modifyDecl((decl) => {
                                decl.cod = ob;
                            });
                        }}
                        obType={codType()}
                        generateId={v7}
                        isInvalid={codInvalid()}
                        isActive={props.isActive && activeInput() === "cod"}
                        deleteBackward={() => setActiveInput("mor")}
                        exitBackward={() => setActiveInput("dom")}
                        exitForward={props.actions.activateBelow}
                        exitLeft={() => setActiveInput("mor")}
                        hasFocused={() => {
                            setActiveInput("cod");
                            props.actions.hasFocused?.();
                        }}
                    />
                </Match>
            </Switch>
        </div>
    );
}

type DiagramMorphismCellInput = "mor" | "dom" | "cod";
