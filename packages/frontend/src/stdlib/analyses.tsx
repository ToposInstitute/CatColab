import { lazy } from "solid-js";

import type { MorType, ObType } from "catlog-wasm";
import type { DiagramAnalysisMeta, ModelAnalysisMeta } from "../theory";
import * as GraphLayoutConfig from "../visualization/graph_layout_config";
import type * as Checkers from "./analyses/checker_types";
import type * as Simulators from "./analyses/simulator_types";

export function configureDecapodes(options: {
    id?: string;
    name?: string;
    description?: string;
}): DiagramAnalysisMeta<Simulators.DecapodesAnalysisContent> {
    const {
        id = "decapodes",
        name = "Simulation",
        description = "Simulate the PDE using Decapodes",
    } = options;
    return {
        id,
        name,
        description,
        component: (props) => <Decapodes {...props} />,
        initialContent: () => ({
            domain: null,
            mesh: null,
            initialConditions: {},
            plotVariables: {},
            scalars: {},
            duration: 10,
        }),
    };
}

const Decapodes = lazy(() => import("./analyses/decapodes"));

export function configureDiagramGraph(options: {
    id: string;
    name: string;
    description?: string;
    help?: string;
}): DiagramAnalysisMeta<GraphLayoutConfig.Config> {
    const { id, name, description, help } = options;
    return {
        id,
        name,
        description,
        help,
        component: (props) => <DiagramGraph title={name} {...props} />,
        initialContent: GraphLayoutConfig.defaultConfig,
    };
}

const DiagramGraph = lazy(() => import("./analyses/diagram_graph"));

export function configureLinearODE(options: {
    id?: string;
    name?: string;
    description?: string;
    help?: string;
    simulate: Simulators.LinearODESimulator;
}): ModelAnalysisMeta<Simulators.LinearODEProblemData> {
    const {
        id = "linear-ode",
        name = "Linear ODE dynamics",
        description = "Simulate the system using a constant-coefficient linear first-order ODE",
        help = "linear-ode",
        simulate,
    } = options;
    return {
        id,
        name,
        description,
        help,
        component: (props) => <LinearODE simulate={simulate} title={name} {...props} />,
        initialContent: () => ({
            coefficients: {},
            initialValues: {},
            duration: 10,
        }),
    };
}

const LinearODE = lazy(() => import("./analyses/linear_ode"));

export function configureLotkaVolterra(options: {
    id?: string;
    name?: string;
    description?: string;
    help?: string;
    simulate: Simulators.LotkaVolterraSimulator;
}): ModelAnalysisMeta<Simulators.LotkaVolterraProblemData> {
    const {
        id = "lotka-volterra",
        name = "Lotka-Volterra dynamics",
        description = "Simulate the system using a Lotka-Volterra ODE",
        help = "lotka-volterra",
        simulate,
    } = options;
    return {
        id,
        name,
        description,
        help,
        component: (props) => <LotkaVolterra simulate={simulate} title={name} {...props} />,
        initialContent: () => ({
            interactionCoefficients: {},
            growthRates: {},
            initialValues: {},
            duration: 10,
        }),
    };
}

const LotkaVolterra = lazy(() => import("./analyses/lotka_volterra"));

export function configureMassAction(options: {
    id?: string;
    name?: string;
    description?: string;
    help?: string;
    simulate: Simulators.MassActionSimulator;
    isState?: (obType: ObType) => boolean;
    isTransition?: (morType: MorType) => boolean;
}): ModelAnalysisMeta<Simulators.MassActionProblemData> {
    const {
        id = "mass-action",
        name = "Mass-action dynamics",
        description = "Simulate the system using the law of mass action",
        help = "mass-action",
        ...otherOptions
    } = options;
    return {
        id,
        name,
        description,
        help,
        component: (props) => <MassAction title={name} {...otherOptions} {...props} />,
        initialContent: () => ({
            rates: {},
            initialValues: {},
            duration: 10,
        }),
    };
}

const MassAction = lazy(() => import("./analyses/mass_action"));

export function configureModelGraph(options: {
    id: string;
    name: string;
    description?: string;
    help?: string;
}): ModelAnalysisMeta<GraphLayoutConfig.Config> {
    const { id, name, description, help } = options;
    return {
        id,
        name,
        description,
        help,
        component: (props) => <ModelGraph title={name} {...props} />,
        initialContent: GraphLayoutConfig.defaultConfig,
    };
}

const ModelGraph = lazy(() => import("./analyses/model_graph"));

export function configureMotifFindingAnalysis(options: {
    id: string;
    name: string;
    description?: string;
    help?: string;
    findMotifs: Checkers.MotifFinder;
}): ModelAnalysisMeta<Checkers.MotifFindingAnalysisContent> {
    const { id, name, description, help, findMotifs } = options;
    return {
        id,
        name,
        description,
        help,
        component: (props) => <SubmodelGraphs title={name} findSubmodels={findMotifs} {...props} />,
        initialContent: () => ({
            activeIndex: 0,
            maxPathLength: 5,
        }),
    };
}

const SubmodelGraphs = lazy(() => import("./analyses/submodel_graphs"));

export function configurePetriNetVisualization(options: {
    id: string;
    name: string;
    description?: string;
}): ModelAnalysisMeta<GraphLayoutConfig.Config> {
    const { id, name, description } = options;
    return {
        id,
        name,
        description,
        component: PetriNetVisualization,
        initialContent: GraphLayoutConfig.defaultConfig,
    };
}

const PetriNetVisualization = lazy(() => import("./analyses/petri_net_visualization"));

export function configureReachability(options: {
    id?: string;
    name?: string;
    description?: string;
    help?: string;
    check: Checkers.ReachabilityChecker;
}): ModelAnalysisMeta<Checkers.ReachabilityProblemData> {
    const {
        id = "subreachability",
        name = "Sub-reachability check",
        description = "Check that forbidden tokenings are unreachable",
        help = "subreachability",
        ...otherOptions
    } = options;
    return {
        id,
        name,
        description,
        help,
        component: (props) => <Reachability title={name} {...otherOptions} {...props} />,
        initialContent: () => ({ tokens: {}, forbidden: {} }),
    };
}

const Reachability = lazy(() => import("./analyses/reachability"));

export function configureStockFlowDiagram(options: {
    id: string;
    name: string;
    description?: string;
    help?: string;
}): ModelAnalysisMeta<GraphLayoutConfig.Config> {
    const { id, name, description, help } = options;
    return {
        id,
        name,
        description,
        help,
        component: StockFlowDiagram,
        initialContent: GraphLayoutConfig.defaultConfig,
    };
}

const StockFlowDiagram = lazy(() => import("./analyses/stock_flow_diagram"));
