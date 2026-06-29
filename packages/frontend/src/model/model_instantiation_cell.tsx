import {useContext} from "solid-js";
import invariant from "tiny-invariant";

import { useApi } from "../api";
import {useUserState} from "../user/user_state_context";
import { DocRefIdContext } from "../page/context";
import { LiveModelContext, ModelLibraryContext } from "./context";
import type { LiveModelDoc } from "./document";
import { InstantiationCellEditor } from "../components";

export function ModelInstantiationCellEditor(props: {
    instantiation: InstantiatedModel;
    changeContent: (f: (content: InstantiatedModel) => void) => void;
    focus: FocusHandle;
    actions: CellActions;
}) {
    const liveModel = useContext(LiveModelContext);
    const models = useContext(ModelLibraryContext);
    invariant(models);
    const api = useApi();
    const docRefId = useContext(DocRefIdContext);
    const userState = useUserState();

    const refId = () => props.instantiation.model?._id;
    const elaborated = models.useElaboratedModel(refId);

    const filterCompletions = (refId, doc) => {
        if (doc.typeName !== "model") {
            return false;
        }
        if (docRefId && refId === docRefId()) {
            return false;
        }
        const theory = liveModel?.().liveDoc.doc.theory;
        if (theory && doc.theory !== theory) {
            return false;
        }
        return true;
    };

    const config: InstantiationConfig = {
        kind: "model",

        refId,

        setRefId(id) {
            props.changeContent((inst) => {
                inst.model = id ? api.makeUnversionedLink(id, "instantiation") : null;
                if (id && !inst.name) {
                    const docName = userState.documents[id]?.name;
                    if (docName) inst.name = docName;
                }
            });
        },

        filterCompletions(refId, doc) {
            if (doc.typeName !== "model") return false;
            if (docRefId && refId === docRefId()) return false;
            const theory = liveModel?.().liveDoc.doc.theory;
            if (theory && doc.theory !== theory) return false;
            return true;
        },

        hasInstantiated: () => props.instantiation != null,

        completions: () => props.instantiation.obGenerators(),
        idToLabel: (id) => props.instantiation.obGeneratorLabel(id),
        labelToId: (label) => props.instantiation.obGeneratorWithLabel(label),

        obSide(p) {
            const obType = () => {
                const id = p.specialization.id;
                if (id) {
                    const ob: Ob = { tag: "Basic", content: id };
                    const m = props.instantiation;
                    if (m?.hasOb(ob)) return m.obType(ob);
                }
            };
            return (
                <Show when={obType()} fallback={<IdInputPlaceholder />}>
                    {(obType) => (
                        <ObInput
                            placeholder="..."
                            ob={p.specialization.ob}
                            setOb={(ob) =>
                                p.modifySpecialization((s) => {
                                    s.ob = ob;
                                })
                            }
                            obType={obType()}
                            focus={p.focus}
                            deleteBackward={p.deleteBackward}
                            exitBackward={p.exitBackward}
                            exitLeft={p.exitLeft}
                            createBelow={p.createBelow}
                            exitDown={p.exitDown}
                            exitUp={p.exitUp}
                        />
                    )}
                </Show>
            );
        },
    };

    return (
        <InstantiationCellEditor
            instantiation={props.instantiated as InstantiatedModel}
            modifyInstantiation={(f) =>
                props.changeContent((content) => f(content as InstantiatedModel))
            }
            config={config}
            focus={props.focus}
            actions={props.actions}
        />
    );
}
