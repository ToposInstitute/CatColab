import { createMemo } from "solid-js";

import { type ColumnSchema, FixedTableEditor, PanelHeader } from "catcolab-ui-components";
import type { MorType, ObType } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import type { GraphSpec } from "../../visualization";
import { GraphVisualizationAnalysis } from "./graph_visualization";
import type { PolarityContent } from "./polarity_propagation_config";
import {
    defaultSeed,
    inducedPolarities,
    polarityClass,
    signKey,
} from "./polarity_propagation_core";
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
  contributions (`addSets`), together with the action's own seed. At a genuine
  merge of conflicting signs this is *set-valued*: `A5` fed by `+` and `−` becomes
  `{+, 0, −}`, drawn ambiguous.

Each action also carries an editable **seed** polarity (their `A → P`): source
actions default to `+` and *are* their seed; internal actions default to `0`
(transparent) but can be given an exogenous seed. The computation is a monotone
fixpoint, so it also terminates on cyclic digraphs (the toy example is acyclic,
converging in one topological sweep). */
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

    // An action is a source iff no causal edge targets it.
    const targetedIds = createMemo(() => new Set(edges().map((e) => e.tgt)));
    const seedOf = (actionId: string): Sign =>
        props.content.seeds?.[actionId] ?? defaultSeed(!targetedIds().has(actionId));

    const induced = createMemo(() =>
        inducedPolarities(
            actions().map((a) => a.id),
            edges().map((e) => ({ src: e.src, tgt: e.tgt, sign: signOf(e.id) })),
            Object.fromEntries(actions().map((a) => [a.id, seedOf(a.id)])),
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

    const actionSchema: ColumnSchema<{ id: string; label: string }>[] = [
        {
            contentType: "string",
            header: true,
            content: (a) => a.label,
        },
        {
            contentType: "enum",
            name: "Seed",
            variants: () => [...SIGNS],
            content: (a) => seedOf(a.id),
            setContent: (a, content) =>
                props.changeContent((c) => {
                    if (!c.seeds) {
                        c.seeds = {};
                    }
                    c.seeds[a.id] = (content ?? "+") as Sign;
                }),
        },
        {
            // Read-only: the computed polarity (a set, ambiguous at merges).
            contentType: "string",
            name: "Induced",
            content: (a) => signSetToString(induced().get(a.id) ?? new Set<Sign>()),
        },
    ];

    const edgeSchema: ColumnSchema<{ id: string; label: string }>[] = [
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
            <div class={styles.tableLabel}>{"Action seeds"}</div>
            <FixedTableEditor rows={actions()} schema={actionSchema} />
            <div class={styles.tableLabel}>{"Causal edge influences"}</div>
            <FixedTableEditor rows={edges()} schema={edgeSchema} />
            <GraphVisualizationAnalysis
                graph={graph()}
                config={props.content}
                changeConfig={props.changeContent}
                title="Induced polarities"
            />
        </div>
    );
}
