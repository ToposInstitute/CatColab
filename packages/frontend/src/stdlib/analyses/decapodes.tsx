import Loader from "lucide-solid/icons/loader";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import { createMemo, createResource, createEffect, For, Match, Show, Switch } from "solid-js";

import {
    BlockTitle,
    type ColumnSchema,
    createNumericalColumn,
    ErrorAlert,
    FixedTableEditor,
    Foldable,
    IconButton,
    Warning,
} from "catcolab-ui-components";
import type { ModelDiagramPresentation, ModelPresentation, QualifiedName } from "catlog-wasm";
import type { DiagramAnalysisProps } from "../../analysis";
import { uniqueIndexArray } from "../../util/indexing";
import type { LiveDiagramDoc } from "../../diagram";
import { PDEPlot2D } from "../../visualization";
import type { DecapodesAnalysisContent } from "./simulator_types";

import "./decapodes.css";
import "./simulation.css";

/** Analyze a DEC diagram by performing a simulation using Decapodes.jl. */
export default function Decapodes(props: DiagramAnalysisProps<DecapodesAnalysisContent>) {
    const elaboratedModel = props.liveDiagram.liveModel.elaboratedModel;
    const elaboratedDiagram = props.liveDiagram.elaboratedDiagram;

    const scalars = createMemo<QualifiedName[]>(
        () =>
            elaboratedModel()?.morGeneratorsWithType({
                tag: "Hom",
                content: { tag: "Basic", content: "Object" },
            }) ?? [],
    );

    const [options] = createResource(async () => {
        const response = await fetch("http://127.0.0.1:8080/decapodes-options");

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        return {
            domains: uniqueIndexArray(data.domains, (domain) => domain.name),
        };
    });

	// TODO verify
	createEffect(() => {
    const opts = options();
    const domain = props.content.domain;
    
    if (opts && domain) {
        const domainConfig = opts.domains.get(domain);
        const defaultCondition = domainConfig?.initialConditions[0];
        
        if (defaultCondition) {
            props.changeContent((content) => {
                // Only set defaults for variables that don't already have a condition
                variables().forEach((varId) => {
                    if (!content.initialConditions[varId]) {
                        content.initialConditions[varId] = defaultCondition;
                    }
                });
            });
        }
    }
});


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
                        // content.mesh = null;
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

    const [res, { refetch }] = createResource(
        () => {
            const model = props.liveDiagram.liveModel.elaboratedModel();
            const diagram = props.liveDiagram.elaboratedDiagram();
			const opts = options();
            if (model && diagram && opts) {
                return { model, diagram };
            }
        },

        async ({ model, diagram }) => {
            const { domain, mesh, initialConditions, plotVariables, _scalars, duration } =
                props.content;
            if (domain === null || mesh === null || !Object.values(plotVariables).some((x) => x)) {
                return undefined;
            }

			console.log(props.content);
            const response = await fetch("http://127.0.0.1:8080/decapodes", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: model.presentation(),
                    diagram: diagram.presentation(),
                    analysis: {
                        duration,
                        plotVariables: Object.keys(props.content.plotVariables).filter(
                            (v) => props.content.plotVariables[v],
                        ),
                        domain,
                        mesh,
                        initialConditions: { ...initialConditions },
                        scalars: {},
                    },
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return { model, data: await response.json() };
        },
    );

	const RestartOrRerunButton = () => (
    <Switch>
        <Match when={res.loading}>
            <IconButton>
                <Loader size={16} />
            </IconButton>
        </Match>
        <Match when={true}>
            <IconButton onClick={() => refetch()} tooltip="Re-run the simulation">
                <RotateCcw size={16} />
            </IconButton>
        </Match>
    </Switch>
);

    // TODO return `options()` to Show when
    return (
        <div class="simulation">
            <BlockTitle title="Simulation" actions={RestartOrRerunButton()} />
            <Foldable title="Parameters" defaultExpanded>
                <Show when={options()}>{(opts) => DomainConfig(opts().domains)}</Show>
                <div class="parameters">
                    <FixedTableEditor rows={variables()} schema={variableSchema} />
                    <FixedTableEditor rows={scalars()} schema={scalarSchema} />
                    <FixedTableEditor rows={[null]} schema={toplevelSchema} />
                </div>
            </Foldable>

            <Switch>
                <Match when={res.loading}>{"Loading Julia resource..."}</Match>
                <Match when={res.error}>
                    {(error) => (
                        <Warning title="Failed to start a Julia kernel">
                            <pre>{error().message}</pre>
                        </Warning>
                    )}
                </Match>
                <Match when={props.liveDiagram.validatedDiagram()?.tag !== "Valid"}>
                    <ErrorAlert title="Modeling error">
                        {"Cannot run the simulation because the diagram is invalid"}
                    </ErrorAlert>
                </Match>
                <Match when={res()}>{(data) => <PDEPlot2D data={data()} />}</Match>
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

/** Create data to send to the Julia kernel. */
export const makeSimulationData = (
    liveDiagram: LiveDiagramDoc,
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
        domain,
        mesh,
        initialConditions,
        plotVariables: Object.keys(plotVariables).filter((v) => plotVariables[v]),
        scalars,
        duration,
    };
};
