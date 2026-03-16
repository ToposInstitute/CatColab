import type * as Viz from "@viz-js/viz";
import type * as Elk from "elkjs";

/** Configuration of a graph layout algorithm supported by CatColab. */
export type Config = {
    /** Engine to use for graph layout. */
    layout: Engine;

    /** Primary layout direction, when applicable. */
    direction?: Direction;

    /** Node separation for undirected (neato) layout, in inches. Defaults to 1.0. */
    separation?: number;
};

/** Engines supported for graph layout. */
export enum Engine {
    /** Graphviz with directed layout (program: `dot`). */
    VizDirected = "graphviz-directed",
    /** Graphviz with undirected layout (program: `neato`). */
    VizUndirected = "graphviz-undirected",
    /** ELK with layered layout algorithm. */
    Elk = "elk",
    /** ELK with layered layout algorithm, minimizing bends. */
    ElkLayeredMinBends = "elk-layered-min-bends",
    /** ELK with force-directed layout algorithm. */
    ElkForce = "elk-force",
    /** ELK with stress-minimization layout algorithm. */
    ElkStress = "elk-stress",
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
export const graphvizOptions = (config: Config): Viz.RenderOptions => ({
    engine: graphvizEngine(config.layout),
    graphAttributes:
        config.layout === Engine.VizUndirected
            ? { overlap: "prism", sep: `${config.separation ?? 1.0}` }
            : { rankdir: graphvizRankdir(config.direction ?? Direction.Vertical) },
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

/** Generates a set of ELK layout options from a layout config. */
export const elkOptions = (config: Config): Elk.LayoutOptions => {
    if (config.layout === Engine.ElkForce) {
        return {
            "elk.algorithm": "org.eclipse.elk.force",
        };
    }
    if (config.layout === Engine.ElkStress) {
        return {
            "elk.algorithm": "org.eclipse.elk.stress",
        };
    }
    const direction = elkDirection(config.direction ?? Direction.Vertical);
    if (config.layout === Engine.ElkLayeredMinBends) {
        return {
            "elk.direction": direction,
            "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
            "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
            "elk.layered.crossingMinimization.greedySwitch.type": "TWO_SIDED",
            "elk.layered.edgeRouting.splines.mode": "CONSERVATIVE",
            "elk.layered.thoroughness": "100",
        };
    }
    return {
        "elk.direction": direction,
    };
};

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
