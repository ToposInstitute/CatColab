import type { InstantiatedModel } from "catlog-wasm";
import { DocumentPicker, NameInput } from "../components";

import "./instantiation_cell_editor.css";

/** Editor for an instantiation cell in a model */
export function InstantiationCellEditor(props: {
    instantiation: InstantiatedModel;
    modifyInstantiation: (f: (inst: InstantiatedModel) => void) => void;
    isActive: boolean;
}) {
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
            />
            <span class="is-a" />
            <DocumentPicker
                refId={props.instantiation.model}
                setRefId={(id) => {
                    props.modifyInstantiation((inst) => {
                        inst.model = id;
                    });
                }}
                placeholder="..."
            />
        </div>
    );
}
