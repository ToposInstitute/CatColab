import type * as Viz from "@viz-js/viz";

/** Configuration of a graph layout algorithm supported by CatColab. */
export type Config = {
    /** Engine to use for graph layout. */
    layout: Engine;

    /** Primary layout direction, when applicable. */
    direction?: Direction;
};

/** Engines supported for graph layout.

At this time we support only programs from Graphviz. In the future we may
support other tools.
 */
export enum Engine {
    VizDirected = "graphviz-directed",
    VizUndirected = "graphviz-undirected",
}

/** Layout direction for graph layouts with a primary/preferred direction. */
export enum Direction {
    Horizontal = "horizontal",
    Vertical = "vertical",
}

/** Construct the default graph layout configuration. */
export const defaultConfig = (): Config => ({
    layout: Engine.VizDirected,
});

export const graphvizOptions = (config: Config): Viz.RenderOptions => ({
    engine: graphvizEngine(config.layout),
    graphAttributes: {
        rankdir: graphvizRankdir(config.direction ?? Direction.Vertical),
    },
});

function graphvizEngine(layout: Engine): Viz.RenderOptions["engine"] {
    switch (layout) {
        case Engine.VizDirected:
            return "dot";
        case Engine.VizUndirected:
            return "neato";
        default:
            throw new Error(`No program in Graphviz for layout engine: ${layout}`);
    }
}

const graphvizRankdir = (direction: Direction) => {
    switch (direction) {
        case Direction.Horizontal:
            return "LR";
        case Direction.Vertical:
            return "TB";
        default:
            throw new Error(`Unknown layout direction: ${direction}`);
    }
};
