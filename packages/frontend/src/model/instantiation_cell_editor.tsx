import { createSignal } from "solid-js";

import { NameInput } from "catcolab-ui-components";
import type { InstantiatedModel } from "catlog-wasm";
import { useApi } from "../api";
import { DocumentPicker } from "../components";
import type { CellActions } from "../notebook";

import "./instantiation_cell_editor.css";

/** Editor for an instantiation cell in a model */
export function InstantiationCellEditor(props: {
    instantiation: InstantiatedModel;
    modifyInstantiation: (f: (inst: InstantiatedModel) => void) => void;
    isActive: boolean;
    actions: CellActions;
}) {
    const api = useApi();

    const [activeInput, setActiveInput] = createSignal<InstantiationCellInput>("name");

    return (
        <div class="formal-judgment model-instantiation">
            <NameInput
                name={props.instantiation.name}
                setName={(name) =>
                    props.modifyInstantiation((inst) => {
                        inst.name = name;
                    })
                }
                placeholder="Unnamed"
                deleteBackward={props.actions.deleteBackward}
                deleteForward={props.actions.deleteForward}
                exitUp={props.actions.activateAbove}
                exitDown={props.actions.activateBelow}
                exitRight={() => setActiveInput("model")}
                exitForward={() => setActiveInput("model")}
                isActive={props.isActive && activeInput() === "name"}
                hasFocused={() => {
                    setActiveInput("name");
                    props.actions.hasFocused?.();
                }}
            />
            <span class="is-a" />
            <DocumentPicker
                refId={props.instantiation.model?._id ?? null}
                setRefId={(refId) => {
                    props.modifyInstantiation((inst) => {
                        inst.model = refId ? api.makeUnversionedLink(refId, "instantiation") : null;
                    });
                }}
                placeholder="..."
                deleteBackward={() => setActiveInput("name")}
                exitUp={props.actions.activateAbove}
                exitDown={props.actions.activateBelow}
                exitLeft={() => setActiveInput("name")}
                exitBackward={() => setActiveInput("name")}
                isActive={props.isActive && activeInput() === "model"}
                hasFocused={() => {
                    setActiveInput("model");
                    props.actions.hasFocused?.();
                }}
            />
        </div>
    );
}

type InstantiationCellInput = "name" | "model";
