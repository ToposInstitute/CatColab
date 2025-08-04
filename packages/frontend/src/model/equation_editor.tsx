import { createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";

import { InlineInput } from "../components";
import type { CellActions } from "../notebook";
import { LiveModelContext } from "./context";
import type { EquationDecl } from "catlaborator";

/** Editor for a moprhism declaration cell in a model.
 */
export function EquationCellEditor(props: {
    equation: EquationDecl;
    modifyEquation: (f: (decl: EquationDecl) => void) => void;
    isActive: boolean;
    actions: CellActions;
}) {
    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    const [activeInput, setActiveInput] = createSignal<EquationCellInput>("lhs");

    return (
        <div class="formal-judgment morphism-decl">
            <div>
                <InlineInput
                    placeholder="..."
                    text={props.equation.lhs}
                    setText={(text) => {
                        props.modifyEquation((mor) => {
                            mor.lhs = text;
                        });
                    }}
                    isActive={props.isActive && activeInput() === "lhs"}
                    deleteForward={() => setActiveInput("rhs")}
                    exitBackward={() => props.actions.activateAbove}
                    exitForward={() => setActiveInput("rhs")}
                    exitRight={() => setActiveInput("rhs")}
                    hasFocused={() => {
                        setActiveInput("lhs");
                        props.actions.hasFocused?.();
                    }}
                />
            </div>
            =
            <div>
                <InlineInput
                    placeholder="..."
                    text={props.equation.rhs}
                    setText={(text) => {
                        props.modifyEquation((eq) => {
                            eq.rhs = text;
                        });
                    }}
                    isActive={props.isActive && activeInput() === "rhs"}
                    deleteBackward={() => setActiveInput("lhs")}
                    exitBackward={() => setActiveInput("lhs")}
                    exitForward={props.actions.activateBelow}
                    exitLeft={() => setActiveInput("lhs")}
                    hasFocused={() => {
                        setActiveInput("rhs");
                        props.actions.hasFocused?.();
                    }}
                />
            </div>
        </div>
    );
}

type EquationCellInput = "lhs" | "rhs";
