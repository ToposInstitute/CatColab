import { useContext } from "solid-js";
import invariant from "tiny-invariant";

import { BasicMorInput } from "../model/morphism_input";
import type { CellActions } from "../notebook";
import { LiveDiagramContext } from "./context";
import type { DiagramMorphismDecl } from "./types";

//import arrowStyles from "../stdlib/arrow_styles.module.css";

/** Editor for a morphism declaration cell in a diagram in a model.
 */
export function DiagramMorphismCellEditor(props: {
    decl: DiagramMorphismDecl;
    modifyDecl: (f: (decl: DiagramMorphismDecl) => void) => void;
    isActive: boolean;
    actions: CellActions;
}) {
    let morRef!: HTMLInputElement;

    const liveDiagram = useContext(LiveDiagramContext);
    invariant(liveDiagram, "Live diagram should be provided as context");
    const theory = () => liveDiagram.liveModel.theory();

    return (
        <div class="formal-judgment diagram-morphism-decl">
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
    );
}
