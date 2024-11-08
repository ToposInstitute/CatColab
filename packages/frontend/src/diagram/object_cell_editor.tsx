import { InlineInput } from "../components";
import type { CellActions } from "../notebook";
import type { DiagramObjectDecl } from "./types";

/** Editor an object declaration cell in a diagram in a model.
 */
export function DiagramObjectCellEditor(props: {
    decl: DiagramObjectDecl;
    modifyDecl: (f: (decl: DiagramObjectDecl) => void) => void;
    actions: CellActions;
}) {
    return (
        <div class="diagram-object-decl">
            <InlineInput
                text={props.decl.name}
                setText={(text) => {
                    props.modifyDecl((decl) => {
                        decl.name = text;
                    });
                }}
            />
        </div>
    );
}
