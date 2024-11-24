import type * as Viz from "@viz-js/viz";
import { Show, createSignal } from "solid-js";
import { P, match } from "ts-pattern";

import type { ModelAnalysisProps } from "../../analysis";
import type { ModelJudgment } from "../../model";
import type { ModelAnalysisMeta, Theory } from "../../theory";
import { DownloadSVGButton, GraphvizSVG, type SVGRefProp } from "../../visualization";
import {
    type GraphContent,
    type GraphvizAttributes,
    defaultEdgeAttributes,
    defaultGraphAttributes,
    defaultNodeAttributes,
    graphvizEngine,
    graphvizFontname,
    svgCssClasses,
} from "./graph";

import baseStyles from "./base_styles.module.css";

/** Configure a graph visualization for use with models of a double theory. */
export function configureModelGraph(options: {
    id: string;
    name: string;
    description?: string;
}): ModelAnalysisMeta<GraphContent> {
    const { id, name, description } = options;
    return {
        id,
        name,
        description,
        component: (props) => <ModelGraph title={name} {...props} />,
        initialContent: () => ({
            layout: "graphviz-directed",
        }),
    };
}

/** Visualize a model of a double theory as a graph.

Such a visualization makes sense for any discrete double theory since the
generators of such a model are just a typed graph. For other kinds of double
theories, any basic morphism whose domain or codomain is not a basic object will
be ignored.

For now, the layout of the graph is computed by Graphviz. Other layout engines
may be added in the future.
 */
export function ModelGraph(
    props: {
        title?: string;
    } & ModelAnalysisProps<GraphContent>,
) {
    const [svgRef, setSvgRef] = createSignal<SVGSVGElement>();

    const title = () => props.title ?? "Graph";

    return (
        <div class="model-graph">
            <div class={baseStyles.panel}>
                <span class={baseStyles.title}>{title()}</span>
                <span class={baseStyles.filler} />
                <DownloadSVGButton
                    svg={svgRef()}
                    tooltip={`Export the ${title().toLowerCase()} as SVG`}
                    size={16}
                />
            </div>
            <Show when={props.liveModel.theory()}>
                {(theory) => (
                    <ModelGraphviz
                        model={props.liveModel.formalJudgments()}
                        theory={theory()}
                        options={{
                            engine: graphvizEngine(props.content.layout),
                        }}
                        ref={setSvgRef}
                    />
                )}
            </Show>
        </div>
    );
}

/** Visualize a model of a double theory as a graph using Graphviz.
 */
export function ModelGraphviz(props: {
    model: ModelJudgment[];
    theory: Theory;
    attributes?: GraphvizAttributes;
    options?: Viz.RenderOptions;
    ref?: SVGRefProp;
}) {
    return (
        <GraphvizSVG
            graph={modelToGraphviz(props.model, props.theory, props.attributes)}
            options={props.options}
            ref={props.ref}
        />
    );
}

/** Convert a model of a double theory into a Graphviz graph.
 */
export function modelToGraphviz(
    model: ModelJudgment[],
    theory: Theory,
    attributes?: GraphvizAttributes,
): Viz.Graph {
    const nodes = new Map<string, Required<Viz.Graph>["nodes"][0]>();
    for (const judgment of model) {
        if (judgment.tag === "object") {
            const { id, name } = judgment;
            const meta = theory.modelObTypeMeta(judgment.obType);
            nodes.set(id, {
                name: id,
                attributes: {
                    id,
                    label: name,
                    class: svgCssClasses(meta).join(" "),
                    fontname: graphvizFontname(meta),
                },
            });
        }
    }

    const edges: Required<Viz.Graph>["edges"] = [];
    for (const judgment of model) {
        const matched = match(judgment)
            .with(
                {
                    tag: "morphism",
                    morType: P.select("morType"),
                    dom: {
                        tag: "Basic",
                        content: P.select("domId"),
                    },
                    cod: {
                        tag: "Basic",
                        content: P.select("codId"),
                    },
                },
                (matched) => matched,
            )
            .otherwise(() => null);
        if (!matched) {
            continue;
        }
        const { morType, codId, domId } = matched;
        const meta = theory.modelMorTypeMeta(morType);
        edges.push({
            head: codId,
            tail: domId,
            attributes: {
                id: judgment.id,
                label: judgment.name,
                class: svgCssClasses(meta).join(" "),
                fontname: graphvizFontname(meta),
                // Not recognized by Graphviz but will be passed through!
                arrowstyle: meta?.arrowStyle ?? "default",
            },
        });
    }

    return {
        directed: true,
        nodes: Array.from(nodes.values()),
        edges,
        graphAttributes: { ...defaultGraphAttributes, ...attributes?.graph },
        nodeAttributes: { ...defaultNodeAttributes, ...attributes?.node },
        edgeAttributes: { ...defaultEdgeAttributes, ...attributes?.edge },
    };
}
