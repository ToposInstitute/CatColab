import { NameInput } from "catcolab-ui-components";
import type { InstantiatedModel } from "catlog-wasm";
import { useApi } from "../api";
import { DocumentPicker } from "../components";

import "./instantiation_cell_editor.css";

/** Editor for an instantiation cell in a model */
export function InstantiationCellEditor(props: {
    instantiation: InstantiatedModel;
    modifyInstantiation: (f: (inst: InstantiatedModel) => void) => void;
    isActive: boolean;
}) {
    const api = useApi();

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
                refId={props.instantiation.model?._id ?? null}
                setRefId={(refId) => {
                    props.modifyInstantiation((inst) => {
                        inst.model = refId ? api.makeUnversionedLink(refId, "instantiation") : null;
                    });
                }}
                placeholder="..."
            />
        </div>
    );
}
