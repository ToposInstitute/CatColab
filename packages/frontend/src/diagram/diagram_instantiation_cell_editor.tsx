import { useContext } from "solid-js";
import invariant from "tiny-invariant";

import { Nb } from "catcolab-document-methods";
import type { InstantiatedDiagram, DiagramJudgment } from "catcolab-document-types";
import { type FocusHandle } from "catcolab-ui-components";
import type { Ob } from "catlog-wasm";
import { useApi } from "../api";
import { IdInput, InstantiationCellEditor, type InstantiationConfig } from "../components";
import type { CellActions } from "../notebook";
import { DocRefIdContext } from "../page/context";
import { useUserState } from "../user/user_state_context";
import { LiveDiagramContext, DiagramLibraryContext } from "./context";

export function DiagramInstantiationCellEditor(props: {
    instantiation: InstantiatedDiagram;
    changeContent: (f: (content: InstantiatedDiagram) => void) => void;
    focus: FocusHandle;
    actions: CellActions;
}) {
    const api = useApi();
    const docRefId = useContext(DocRefIdContext);
    const liveDiagram = useContext(LiveDiagramContext);
    const userState = useUserState();
    const diagrams = useContext(DiagramLibraryContext);
    invariant(diagrams);

    const refId = () => props.instantiation.diagram?._id;
    const instantiated = diagrams.useLiveDiagram(refId);

    // --- completions from the instantiated diagram's judgments ---
    const instantiatedJudgments = (): DiagramJudgment[] => {
        const live = instantiated();
        if (!live) return [];
        return Nb.getFormalContent(live.liveDoc.doc.notebook);
    };

    const obJudgments = () => instantiatedJudgments().filter((j) => j.tag === "object");

    // --- completions from the current diagram's judgments ---
    const currentJudgments = (): DiagramJudgment[] => {
        const live = liveDiagram?.();
        if (!live) return [];
        return Nb.getFormalContent(live.liveDoc.doc.notebook);
    };

    const currentObJudgments = () => currentJudgments().filter((j) => j.tag === "object");
    const currentObGenerators = () => currentObJudgments().map((j) => j.id);

    const currentObIdToLabel = (id: string): string[] | undefined => {
        const j = currentObJudgments().find((j) => j.id === id);
        return j?.name ? [j.name] : undefined;
    };

    const currentObLabelToId = (label: string[]) => {
        const name = label[0];
        const matches = currentObJudgments().filter((j) => j.name === name);
        if (matches.length === 1) return { tag: "Unique" as const, content: matches[0].id };
        if (matches.length > 1) return { tag: "Ambiguous" as const };
        return { tag: "None" as const };
    };

    const config: InstantiationConfig = {
        kind: "diagram",

        refId,

        setRefId(id) {
            props.changeContent((inst) => {
                inst.diagram = id ? api.makeUnversionedLink(id, "instantiation") : null;
                if (id && !inst.name) {
                    const docName = userState.documents[id]?.name;
                    if (docName) inst.name = docName;
                }
            });
        },

        filterCompletions(refId, doc) {
            if (doc.typeName !== "diagram") return false;
            if (docRefId && refId === docRefId()) return false;
            const theory = liveDiagram?.().liveDoc.doc.theory;
            if (theory && doc.theory !== theory) return false;
            return true;
        },

        hasInstantiated: () => instantiated() != null,

        // id-side: from the instantiated diagram's judgments
        completions: () => obJudgments().map((j) => j.id),
        idToLabel(id) {
            const j = obJudgments().find((j) => j.id === id);
            return j?.name ? [j.name] : undefined;
        },
        labelToId(label) {
            const name = label[0];
            const matches = obJudgments().filter((j) => j.name === name);
            if (matches.length === 1) return { tag: "Unique" as const, content: matches[0].id };
            if (matches.length > 1) return { tag: "Ambiguous" as const };
            return { tag: "None" as const };
        },

        // this should be 
        obSide(p) {
            return (
                <IdInput
                    placeholder="..."
                    id={p.specialization.ob?.tag === "Basic" ? p.specialization.ob.content : null}
                    setId={(id) => {
                        p.modifySpecialization((spec) => {
                            spec.ob = id ? { tag: "Basic", content: id } : null;
                        });
                    }}
                    completions={currentObGenerators()}
                    idToLabel={currentObIdToLabel}
                    labelToId={currentObLabelToId}
                    focus={p.focus}
                    deleteBackward={p.deleteBackward}
                    exitBackward={p.exitBackward}
                    exitLeft={p.exitLeft}
                    createBelow={p.createBelow}
                    exitDown={p.exitDown}
                    exitUp={p.exitUp}
                />
            );
        },
    };

    return (
        <InstantiationCellEditor
            instantiation={props.instantiation as InstantiatedDiagram}
            modifyInstantiation={(f) => props.changeContent((content) => f(content as InstantiatedDiagram))}
            config={config}
            focus={props.focus}
            actions={props.actions}
        />
    );
}
