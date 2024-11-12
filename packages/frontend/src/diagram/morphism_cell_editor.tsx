import { useContext } from "solid-js";
import invariant from "tiny-invariant";

import { BasicMorInput } from "../model/morphism_input";
import type { CellActions } from "../notebook";
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
    let morRef!: HTMLInputElement;
    let domRef!: HTMLInputElement;
    let codRef!: HTMLInputElement;

    const liveDiagram = useContext(LiveDiagramContext);
    invariant(liveDiagram, "Live diagram should be provided as context");
    const theory = () => liveDiagram.liveModel.theory();

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
            />
            <div class={arrowStyles.arrowWithName}>
                <div class={arrowStyles.arrowName}>
                    <BasicMorInput
                        ref={morRef}
                        mor={props.decl.over}
                        setMor={(mor) => {
                            props.modifyDecl((decl) => {
                                decl.over = mor;
                            });
                        }}
                        morType={props.decl.morType}
                        placeholder={theory()?.modelMorTypeMeta(props.decl.morType)?.name}
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
            />
        </div>
    );
}
