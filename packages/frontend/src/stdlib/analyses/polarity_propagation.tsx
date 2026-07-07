import { createMemo } from "solid-js";

import { type ColumnSchema, FixedTableEditor, PanelHeader } from "catcolab-ui-components";
import type { MorType, ObType } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import type { GraphSpec } from "../../visualization";
import { GraphVisualizationAnalysis } from "./graph_visualization";
import type { PolarityContent } from "./polarity_propagation_config";
import { inducedPolarities, polarityClass, signKey } from "./polarity_propagation_core";
import { type Sign, signGlyph, SIGNS, signSetToString } from "./sign_hyperfield";

import styles from "./polarity_propagation.module.css";

const ACTION: ObType = { tag: "Basic", content: "Action" };
const CAUSAL: MorType = { tag: "Basic", content: "Causal" };

/** SVG class for an action node, keyed by [`polarityClass`]. */
const NODE_CLASS: Record<string, string> = {
    pos: styles.pos,
    neg: styles.neg,
    zero: styles.zero,
    ambiguous: styles.ambiguous,
    unknown: styles.unknown,
};

/** SVG class for a causal edge, keyed by [`signKey`]. */
const EDGE_CLASS: Record<string, string> = {
    pos: styles.edge_pos,
    neg: styles.edge_neg,
    zero: styles.edge_zero,
};

/** Propagate signs through a causal hypergraph and visualize the induced polarities.

Each causal edge carries an influence sign in the sign hyperfield `{+, 0, −}`
(editable in the table). The induced polarity of each action is then computed by
the two hyperring operations working along the two structural axes:

- **`∘` along each causal edge** — an edge acts on its source action's polarity by
  multiplication (`scaleSet`). This is composition of influences.
- **`⊕` at each fan-in** — an action fed by several causal edges hyper-adds their
  contributions (`addSets`). At a genuine merge of conflicting signs this is
  *set-valued*: `A5` fed by `+` and `−` becomes `{+, 0, −}`, drawn ambiguous.

Source actions (no incoming causal edge) are seeded with `{+}`. The computation is
a monotone fixpoint, so it also terminates on cyclic digraphs (the toy example is
acyclic, converging in one topological sweep). */
export default function PolarityPropagation(
    props: ModelAnalysisProps<PolarityContent> & { title?: string },
) {
    const model = () => props.liveModel.elaboratedModel();

    const actions = createMemo(() => {
        const m = model();
        if (!m) {
            return [] as { id: string; label: string }[];
        }
        return m.obGeneratorsWithType(ACTION).map((id) => ({
            id,
            label: m.obPresentation(id).label?.join(".") ?? id,
        }));
    });

    const edges = createMemo(() => {
        const m = model();
        if (!m) {
            return [] as { id: string; label: string; src: string; tgt: string }[];
        }
        const out: { id: string; label: string; src: string; tgt: string }[] = [];
        for (const id of m.morGeneratorsWithType(CAUSAL)) {
            const mor = m.morPresentation(id);
            if (!(mor && mor.dom.tag === "Basic" && mor.cod.tag === "Basic")) {
                continue;
            }
            out.push({
                id,
                label: mor.label?.join(".") ?? id,
                src: mor.dom.content,
                tgt: mor.cod.content,
            });
        }
        return out;
    });

    const signOf = (edgeId: string): Sign => props.content.signs?.[edgeId] ?? "+";

    const induced = createMemo(() =>
        inducedPolarities(
            actions().map((a) => a.id),
            edges().map((e) => ({ src: e.src, tgt: e.tgt, sign: signOf(e.id) })),
        ),
    );

    const graph = createMemo<GraphSpec.Graph>(() => {
        const polarities = induced();
        const nodes: GraphSpec.Node[] = actions().map((a) => {
            const set = polarities.get(a.id) ?? new Set<Sign>();
            return {
                id: a.id,
                label: `${a.label}: ${signSetToString(set)}`,
                cssClass: NODE_CLASS[polarityClass(set)],
                minimumWidth: 48,
                minimumHeight: 36,
            };
        });
        const graphEdges: GraphSpec.Edge[] = edges().map((e) => {
            const sign = signOf(e.id);
            return {
                id: e.id,
                source: e.src,
                target: e.tgt,
                label: `${e.label}: ${signGlyph(sign)}`,
                cssClass: EDGE_CLASS[signKey(sign)],
            };
        });
        return { nodes, edges: graphEdges };
    });

    const schema: ColumnSchema<{ id: string; label: string }>[] = [
        {
            contentType: "string",
            header: true,
            content: (e) => e.label,
        },
        {
            contentType: "enum",
            name: "Influence",
            variants: () => [...SIGNS],
            content: (e) => signOf(e.id),
            setContent: (e, content) =>
                props.changeContent((c) => {
                    if (!c.signs) {
                        c.signs = {};
                    }
                    c.signs[e.id] = (content ?? "+") as Sign;
                }),
        },
    ];

    return (
        <div class={styles.container}>
            <PanelHeader title={props.title ?? "Polarity propagation"} />
            <FixedTableEditor rows={edges()} schema={schema} />
            <GraphVisualizationAnalysis
                graph={graph()}
                config={props.content}
                changeConfig={props.changeContent}
                title="Induced polarities"
            />
        </div>
    );
}
