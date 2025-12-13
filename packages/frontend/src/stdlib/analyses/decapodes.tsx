import { For, Match, Show, Switch, createMemo } from "solid-js";

import type { ModelDiagramPresentation, ModelPresentation, QualifiedName } from "catlog-wasm";
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
import type { LiveDiagramDocument } from "../../diagram";
import { uniqueIndexArray } from "../../util/indexing";
import { PDEPlot2D, type PDEPlotData2D } from "../../visualization";
import { createJuliaKernel, executeAndRetrieve } from "./jupyter";
import type { DecapodesAnalysisContent } from "./simulator_types";

import Loader from "lucide-solid/icons/loader";
import RotateCcw from "lucide-solid/icons/rotate-ccw";

import "./decapodes.css";
import "./simulation.css";

/** Analyze a DEC diagram by performing a simulation using Decapodes.jl. */
export default function Decapodes(props: DiagramAnalysisProps<DecapodesAnalysisContent>) {
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
			console.log(simulationData);
            if (!simulationData) {
                return undefined;
            }
            return makeSimulationCode(simulationData);
        },
        (data: PDEPlotData2D) => data,
    );

    const elaboratedModel = () => props.liveDiagram.liveModel.elaboratedModel();
    const elaboratedDiagram = () => props.liveDiagram.elaboratedDiagram();

    const scalars = createMemo<QualifiedName[]>(
        () =>
            elaboratedModel()?.morGeneratorsWithType({
                tag: "Hom",
                content: { tag: "Basic", content: "Object" },
            }) ?? [],
        [],
    );

    const variables = (): QualifiedName[] => elaboratedDiagram()?.obGenerators() ?? [];

    const scalarSchema: ColumnSchema<QualifiedName>[] = [
        {
            contentType: "string",
            header: true,
            name: "Scalar constant",
            content: (id) => elaboratedModel()?.morGeneratorLabel(id)?.join(".") ?? "",
        },
        createNumericalColumn({
            name: "Value",
            data: (id) => props.content.scalars[id],
            setData: (id, value) =>
                props.changeContent((content) => {
                    content.scalars[id] = value;
                }),
        }),
    ];

    const variableSchema: ColumnSchema<QualifiedName>[] = [
        {
            contentType: "string",
            header: true,
            name: "Variable",
            content: (id) => elaboratedDiagram()?.obGeneratorLabel(id)?.join(".") ?? "",
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
            content: (id) => props.content.initialConditions[id] ?? null,
            setContent: (id, value) =>
                props.changeContent((content) => {
                    if (value === null) {
                        delete content.initialConditions[id];
                    } else {
                        content.initialConditions[id] = value;
                    }
                }),
        },
        {
            contentType: "boolean",
            name: "Plot",
            content: (id) => props.content.plotVariables[id] ?? false,
            setContent: (id, value) =>
                props.changeContent((content) => {
                    content.plotVariables[id] = value;
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
                    <FixedTableEditor rows={variables()} schema={variableSchema} />
                    <FixedTableEditor rows={scalars()} schema={scalarSchema} />
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
                <Match when={props.liveDiagram.validatedDiagram()?.tag !== "Valid"}>
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
    /** Diagram defining the system of equations to simulate. */
    diagram: ModelDiagramPresentation;

    /** Model that the diagram is in. */
    model: ModelPresentation;

	/** */
    analysis: SimulationAnalysis; 
};

type SimulationAnalysis = {
	
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

}

/** Julia code run after kernel is started. */
const makeInitCode = () =>
    `
    for k in keys(Base.text_colors)
		Base.text_colors[k] = ""
	end

    import IJulia
    import JSON3
    IJulia.register_jsonmime(MIME"application/json"())
    using CatColabInterop

    JsonValue(supported_decapodes_geometries())
    `;

/** Julia code run to perform a simulation. */
const makeSimulationCode = (data: SimulationData) =>
    `
    # needed for returning large amounts of data, should be paired with a similar setting on the jupyter server
    IJulia.set_max_stdio(1_000_000_000) 

    simulation = DecapodeSimulation(raw"""${JSON.stringify(data)}""");
    simulator = evalsim(simulation.pode);

    f = simulator(simulation.geometry.dualmesh, simulation.generate, DiagonalHodge());

	result = run(f, simulation, ComponentArray(k=0.5,))

    JSON3.write(stdout, result)
    `;

/** Create data to send to the Julia kernel. */
const makeSimulationData = (
    liveDiagram: LiveDiagramDocument,
    content: DecapodesAnalysisContent,
): SimulationData | undefined => {
    const validatedModel = liveDiagram.liveModel.validatedModel();
    const validatedDiagram = liveDiagram.validatedDiagram();
    if (!(validatedModel?.tag === "Valid" && validatedDiagram?.tag === "Valid")) {
        return undefined;
    }

    const { domain, mesh, initialConditions, plotVariables, scalars, duration } = content;
    if (domain === null || mesh === null || !Object.values(plotVariables).some((x) => x)) {
        return undefined;
    }

    return {
        diagram: validatedDiagram.diagram.presentation(),
        model: validatedModel.model.presentation(),
        analysis: {
			domain,
			mesh,
			initialConditions,
			plotVariables: Object.keys(plotVariables).filter((v) => plotVariables[v]),
			scalars,
			duration,
		}
    };
};
