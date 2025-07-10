import type * as Viz from "@viz-js/viz";
import { Show } from "solid-js";

import { FormGroup, SelectField } from "../../components";
import type { BaseTypeMeta } from "../../theory";

import textStyles from "../text_styles.module.css";

/** Graph layout engine supported by CatColab.

Currently we just use Graphviz. In the future we may support other tools.
 */
export enum LayoutEngine {
    VizDirected = "graphviz-directed",
    VizUndirected = "graphviz-undirected",
}

/** Layout direction for graph layouts with a primary/preferred direction. */
export enum LayoutDirection {
    Horizontal = "horizontal",
    Vertical = "vertical",
}

/** Configuration for an analysis that visualizes a graph. */
export type GraphConfig = {
    /** Layout engine for graph. */
    layout: LayoutEngine;

    /** Primary layout direction, when applicable. */
    direction?: LayoutDirection;
};

export const defaultGraphConfig = (): GraphConfig => ({
    layout: LayoutEngine.VizDirected,
});

export function GraphConfigForm(props: {
    content: GraphConfig;
    changeContent: (f: (content: GraphConfig) => void) => void;
}) {
    return (
        <FormGroup compact>
            <SelectField
                label="Layout"
                value={props.content.layout}
                onChange={(evt) => {
                    props.changeContent((content) => {
                        content.layout = evt.currentTarget.value as LayoutEngine;
                    });
                }}
            >
                <option value={LayoutEngine.VizDirected}>{"Directed"}</option>
                <option value={LayoutEngine.VizUndirected}>{"Undirected"}</option>
            </SelectField>
            <Show when={props.content.layout === LayoutEngine.VizDirected}>
                <SelectField
                    label="Direction"
                    value={props.content.direction ?? LayoutDirection.Vertical}
                    onChange={(evt) => {
                        props.changeContent((content) => {
                            content.direction = evt.currentTarget.value as LayoutDirection;
                        });
                    }}
                >
                    <option value={LayoutDirection.Horizontal}>{"Horizontal"}</option>
                    <option value={LayoutDirection.Vertical}>{"Vertical"}</option>
                </SelectField>
            </Show>
        </FormGroup>
    );
}

export const graphvizOptions = (config: GraphConfig): Viz.RenderOptions => ({
    engine: graphvizEngine(config.layout),
    graphAttributes: {
        rankdir: graphvizRankdir(config.direction ?? LayoutDirection.Vertical),
    },
});

function graphvizEngine(layout: LayoutEngine): Viz.RenderOptions["engine"] {
    if (layout === LayoutEngine.VizDirected) {
        return "dot";
    } else if (layout === LayoutEngine.VizUndirected) {
        return "neato";
    }
}

const graphvizRankdir = (direction: LayoutDirection) =>
    direction === LayoutDirection.Horizontal ? "LR" : "TB";

/** Top-level attributes of a Graphviz graph. */
export type GraphvizAttributes = {
    graph?: Viz.Graph["graphAttributes"];
    node?: Viz.Graph["nodeAttributes"];
    edge?: Viz.Graph["edgeAttributes"];
};

/** Default graph attributes for Graphviz. */
export const defaultGraphAttributes: Required<Viz.Graph>["graphAttributes"] = {
    nodesep: "0.5",
};

/** Default node attributes for Graphviz. */
export const defaultNodeAttributes: Required<Viz.Graph>["nodeAttributes"] = {
    // XXX: How to set the font size?
    fontsize: "20",
    shape: "box",
    width: 0,
    height: 0,
};

/** Default edge attributes for Graphviz. */
export const defaultEdgeAttributes: Required<Viz.Graph>["edgeAttributes"] = {
    fontsize: "20",
    sep: "5",
};

// XXX: Precise font matching seems impossible here but we'll at least give
// Graphviz a monospace font if and only if we're using one.
export const graphvizFontname = (meta?: BaseTypeMeta): string =>
    meta?.textClasses?.includes(textStyles.code) ? "Courier" : "Helvetica";

// XXX: This should probably go somewhere else.
export const svgCssClasses = (meta?: BaseTypeMeta): string[] => [
    ...(meta?.svgClasses ?? []),
    ...(meta?.textClasses ?? []),
];
