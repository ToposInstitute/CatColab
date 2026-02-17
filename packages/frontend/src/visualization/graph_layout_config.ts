import type * as Viz from "@viz-js/viz";
import type * as Elk from "elkjs";

/** Configuration of a graph layout algorithm supported by CatColab. */
export type Config = {
    /** Engine to use for graph layout. */
    layout: Engine;

    /** Primary layout direction, when applicable. */
    direction?: Direction;

    /** Separation parameter for undirected graph layout (Graphviz neato). */
    sep?: number;

    /** Overlap parameter for undirected graph layout (Graphviz neato). */
    overlap?: string;
};

/** Engines supported for graph layout. */
export enum Engine {
    /** Graphviz with directed layout (program: `dot`). */
    VizDirected = "graphviz-directed",
    /** Graphviz with undirected layout (program: `neato`). */
    VizUndirected = "graphviz-undirected",
    /** ELK, a directed layout. */
    Elk = "elk",
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

/** Generates a set of Graphviz options from a layout config. */
export const graphvizOptions = (config: Config): Viz.RenderOptions => {
    const isUndirected = config.layout === Engine.VizUndirected;
    return {
        engine: graphvizEngine(config.layout),
        graphAttributes: {
            rankdir: graphvizRankdir(config.direction ?? Direction.Vertical),
            ...(isUndirected && { sep: config.sep ?? 1.0 }),
            ...(isUndirected && { overlap: config.overlap ?? "false" }),
        },
    };
};

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

/** Generates a set of ELK layout options from a layout config. */
export const elkOptions = (config: Config): Elk.LayoutOptions => ({
    "elk.direction": elkDirection(config.direction ?? Direction.Vertical),
});

const elkDirection = (direction: Direction) => {
    switch (direction) {
        case Direction.Horizontal:
            return "RIGHT";
        case Direction.Vertical:
            return "DOWN";
        default:
            throw new Error(`Unknown layout direction: ${direction}`);
    }
};
