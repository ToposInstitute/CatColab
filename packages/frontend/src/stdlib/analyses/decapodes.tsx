import { For, Match, Show, Switch, createMemo } from "solid-js";
import { isMatching } from "ts-pattern";

import type { DiagramJudgment, ModelJudgment } from "catlog-wasm";
import type { DiagramAnalysisProps } from "../../analysis";
import {
    type ColumnSchema,
    ErrorAlert,
    FixedTableEditor,
    Foldable,
    IconButton,
    Warning,
    createNumericalColumn,
} from "../../components";
import { type DiagramObjectDecl, type LiveDiagramDocument, fromCatlogDiagram } from "../../diagram";
import type { MorphismDecl } from "../../model";
import type { DiagramAnalysisMeta } from "../../theory";
import { uniqueIndexArray } from "../../util/indexing";
import { PDEPlot2D, type PDEPlotData2D } from "../../visualization";
import { createJuliaKernel, executeAndRetrieve } from "./jupyter";

import Loader from "lucide-solid/icons/loader";
import RotateCcw from "lucide-solid/icons/rotate-ccw";

import "./decapodes.css";
import "./simulation.css";

/** Configuration for a Decapodes analysis of a diagram. */
export type DecapodesContent = {
    domain: string | null;
    mesh: string | null;
    initialConditions: Record<string, string>;
    plotVariables: Record<string, boolean>;
    scalars: Record<string, number>;
    duration: number;
};

export function configureDecapodes(options: {
    id?: string;
    name?: string;
    description?: string;
}): DiagramAnalysisMeta<DecapodesContent> {
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

/** Analyze a DEC diagram by performing a simulation using Decapodes.jl.
 */
export function Decapodes(props: DiagramAnalysisProps<DecapodesContent>) {
    // Step 1: Start the Julia kernel.
    const [kernel, restartKernel] = createJuliaKernel({
        baseUrl: "http://127.0.0.1:8888",
        token: "",
    });

    // Step 2: Run initialization code in the kernel.
    const startedKernel = () => (kernel.error ? undefined : kernel());

    const [options] = executeAndRetrieve(
        startedKernel,
        makeInitCode,
        (options: SimulationOptions) => ({
            domains: uniqueIndexArray(options.domains, (domain) => domain.name),
        }),
    );

    // Step 3: Run the simulation in the kernel!
    const initedKernel = () =>
        kernel.error || options.error || options.loading ? undefined : kernel();

    const [result, rerunSimulation] = executeAndRetrieve(
        initedKernel,
        () => {
            const simulationData = makeSimulationData(props.liveDiagram, props.content);
            if (!simulationData) {
                return undefined;
            }
            return makeSimulationCode(simulationData);
        },
        (data: PDEPlotData2D) => data,
    );

    const obDecls = createMemo<DiagramObjectDecl[]>(() =>
        props.liveDiagram.formalJudgments().filter((jgmt) => jgmt.tag === "object"),
    );

    const scalarDecls = createMemo<MorphismDecl[]>(() => {
        const liveModel = props.liveDiagram.liveModel;
        return liveModel.formalJudgments().filter((jgmt) =>
            isMatching(
                {
                    tag: "morphism",
                    morType: {
                        tag: "Hom",
                        content: { tag: "Basic", content: "Object" },
                    },
                },
                jgmt,
            ),
        );
    });

    const scalarSchema: ColumnSchema<MorphismDecl>[] = [
        {
            contentType: "string",
            header: true,
            name: "Scalar constant",
            content: (mor) => mor.name,
        },
        createNumericalColumn({
            name: "Value",
            data: (mor) => props.content.scalars[mor.id],
            setData: (mor, value) =>
                props.changeContent((content) => {
                    content.scalars[mor.id] = value;
                }),
        }),
    ];

    const variableSchema: ColumnSchema<DiagramObjectDecl>[] = [
        {
            contentType: "string",
            header: true,
            name: "Variable",
            content: (ob) => ob.name,
        },
        {
            contentType: "enum",
            name: "Initial/boundary",
            variants() {
                if (!props.content.domain) {
                    return [];
                }
                return options()?.domains.get(props.content.domain)?.initialConditions ?? [];
            },
            content: (ob) => props.content.initialConditions[ob.id] ?? null,
            setContent: (ob, value) =>
                props.changeContent((content) => {
                    if (value === null) {
                        delete content.initialConditions[ob.id];
                    } else {
                        content.initialConditions[ob.id] = value;
                    }
                }),
        },
        {
            contentType: "boolean",
            name: "Plot",
            content: (ob) => props.content.plotVariables[ob.id] ?? false,
            setContent: (ob, value) =>
                props.changeContent((content) => {
                    content.plotVariables[ob.id] = value;
                }),
        },
    ];

    const toplevelSchema: ColumnSchema<null>[] = [
        createNumericalColumn({
            name: "Duration",
            data: (_) => props.content.duration,
            validate: (_, data) => data >= 0,
            setData: (_, data) =>
                props.changeContent((content) => {
                    content.duration = data;
                }),
        }),
    ];

    const RestartOrRerunButton = () => (
        <Switch>
            <Match when={kernel.loading || options.loading || result.loading}>
                <IconButton>
                    <Loader size={16} />
                </IconButton>
            </Match>
            <Match when={kernel.error || options.error}>
                <IconButton onClick={restartKernel} tooltip="Restart the Julia kernel">
                    <RotateCcw size={16} />
                </IconButton>
            </Match>
            <Match when={true}>
                <IconButton onClick={rerunSimulation} tooltip="Re-run the simulation">
                    <RotateCcw size={16} />
                </IconButton>
            </Match>
        </Switch>
    );

    const DomainConfig = (domains: Map<string, Domain>) => (
        <div class="decapodes-domain">
            <span>Domain:</span>
            <select
                value={props.content.domain ?? undefined}
                onInput={(evt) =>
                    props.changeContent((content) => {
                        const domain = evt.currentTarget.value;
                        if (content.domain === domain) {
                            return;
                        }
                        content.domain = domain;
                        content.mesh = options()?.domains.get(domain)?.meshes[0] ?? null;
                        content.initialConditions = {};
                    })
                }
            >
                <For each={Array.from(domains.values())}>
                    {(domain) => <option value={domain.name}>{domain.name}</option>}
                </For>
            </select>
            <Show when={props.content.domain}>
                {(name) => (
                    <>
                        <span>Mesh:</span>
                        <select
                            value={props.content.mesh ?? undefined}
                            onInput={(evt) =>
                                props.changeContent((content) => {
                                    content.mesh = evt.currentTarget.value;
                                })
                            }
                        >
                            <For each={domains.get(name())?.meshes ?? []}>
                                {(mesh) => <option value={mesh}>{mesh}</option>}
                            </For>
                        </select>
                    </>
                )}
            </Show>
        </div>
    );

    return (
        <div class="simulation">
            <Foldable title="Simulation" header={RestartOrRerunButton()}>
                <Show when={options()}>{(options) => DomainConfig(options().domains)}</Show>
                <div class="parameters">
                    <FixedTableEditor rows={obDecls()} schema={variableSchema} />
                    <FixedTableEditor rows={scalarDecls()} schema={scalarSchema} />
                    <FixedTableEditor rows={[null]} schema={toplevelSchema} />
                </div>
            </Foldable>
            <Switch>
                <Match when={kernel.loading || options.loading}>
                    {"Loading the Julia kernel..."}
                </Match>
                <Match when={kernel.error}>
                    {(error) => (
                        <Warning title="Failed to start a Julia kernel">
                            <pre>{error().message}</pre>
                        </Warning>
                    )}
                </Match>
                <Match when={options.error}>
                    {(error) => (
                        <Warning title="Failed to initialize the Julia kernel">
                            <pre>{error().message}</pre>
                        </Warning>
                    )}
                </Match>
                <Match when={result.loading}>{"Running the simulation..."}</Match>
                <Match when={result.error}>
                    {(error) => (
                        <ErrorAlert title="Simulation error">
                            <pre>{error().message}</pre>
                        </ErrorAlert>
                    )}
                </Match>
                <Match when={props.liveDiagram.validatedDiagram()?.result.tag === "Err"}>
                    <ErrorAlert title="Modeling error">
                        {"Cannot run the simulation because the diagram is invalid"}
                    </ErrorAlert>
                </Match>
                <Match when={result()}>{(data) => <PDEPlot2D data={data()} />}</Match>
            </Switch>
        </div>
    );
}

/** Options supported by Decapodes, defined by the Julia service. */
type SimulationOptions = {
    /** Geometric domains supported by Decapodes. */
    domains: Domain[];
};

/** A geometric domain and its allow discretizations. */
type Domain = {
    /** Name of the domain. */
    name: string;

    /** Supported meshes that discretize the domain. */
    meshes: string[];

    /** Initial/boundary conditions supported for the domain. */
    initialConditions: string[];
};

/** Data sent to the Julia kernel defining a simulation. */
type SimulationData = {
    /** Judgments defining the diagram, including inferred ones. */
    diagram: Array<DiagramJudgment>;

    /** Judgments defining the model. */
    model: Array<ModelJudgment>;

    /** The geometric domain to use for the simulation. */
    domain: string;

    /** The mesh to use for the simulation. */
    mesh: string;

    /** Mapping from variable UUIDs to enum variants for initital conditions. */
    initialConditions: Record<string, string>;

    /** Variables to plot, a list of UUIDs. */
    plotVariables: Array<string>;

    /** Mapping from UIIDs of scalar operations to numerical values. */
    scalars: Record<string, number>;

    /** Duration */
    duration: number;
};

/** Julia code run after kernel is started. */
const makeInitCode = () =>
    `
    import IJulia
    IJulia.register_jsonmime(MIME"application/json"())

    using CatColabInterop

    JsonValue(supported_decapodes_geometries())
    `;

/** Julia code run to perform a simulation. */
const makeSimulationCode = (data: SimulationData) =>
    `
    system = Analysis(ThDecapode(), raw"""${JSON.stringify(data)}""");
    simulator = evalsim(system.pode);

    f = simulator(system.geometry.dualmesh, system.generate, DiagonalHodge());

    soln = run_sim(f, system.init, system.duration, ComponentArray(k=0.5,));

    JsonValue(SimResult(soln, system))
    `;

/** Create data to send to the Julia kernel. */
const makeSimulationData = (
    liveDiagram: LiveDiagramDocument,
    content: DecapodesContent,
): SimulationData | undefined => {
    const validatedDiagram = liveDiagram.validatedDiagram();
    if (validatedDiagram?.result.tag !== "Ok") {
        return undefined;
    }

    const { domain, mesh, initialConditions, plotVariables, scalars, duration } = content;
    if (domain === null || mesh === null || !Object.values(plotVariables).some((x) => x)) {
        return undefined;
    }

    return {
        diagram: fromCatlogDiagram(validatedDiagram.diagram, (id) =>
            liveDiagram.objectIndex().map.get(id),
        ),
        model: liveDiagram.liveModel.formalJudgments(),
        domain,
        mesh,
        initialConditions,
        plotVariables: Object.keys(plotVariables).filter((v) => plotVariables[v]),
        scalars,
        duration,
    };
};
