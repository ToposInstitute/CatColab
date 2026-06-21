import Loader from "lucide-solid/icons/loader";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import {
    useContext,
    createMemo,
    createResource,
    For,
    Match,
    Show,
    Switch,
    createSignal,
    createEffect,
} from "solid-js";
import { unwrap } from "solid-js/store";
import invariant from "tiny-invariant";

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
import { ThDEC } from "catlog-wasm";
import type { DiagramAnalysisProps } from "../../analysis";
import { useApi } from "../../api";
import { LiveDiagramDoc, DiagramLibraryContext } from "../../diagram";
import { PDEPlot2D } from "../../visualization";
import type { DecapodesAnalysisContent } from "./simulator_types";

import "./decapodes.css";
import "./simulation.css";

/** Analyze a DEC diagram by performing a simulation using Decapodes.jl. */
export default function Decapodes(props: DiagramAnalysisProps<DecapodesAnalysisContent>) {
    // Step 1: Start the Julia kernel.
    const [kernel, { refetch: restartKernel }] = createResource(() => undefined);

    // Step 2: Run initialization code in the kernel.
    const [options] = createResource<SimulationOptions | undefined>(() => undefined);

    // Step 3: Run the simulation in the kernel!
    const [result, { refetch: rerunSimulation }] = createResource(() => undefined);
    const api = useApi();

    const diagrams = useContext(DiagramLibraryContext);
    invariant(diagrams);

    const [progress, setProgress] = createSignal<number | null>(null);
    const [status, setStatus] = createSignal<string | null>(null);

    const instantiatedRefIds = createMemo(() => {
        const js = unwrap(props.liveDiagram.formalJudgments());
        return js.filter((j) => "diagram" in j && j.diagram).map((j) => j.diagram._id);
    });

    const [subDiagramDocs] = createResource(instantiatedRefIds, async (refIds) => {
        const entries = await Promise.all(
            refIds.map(async (id) => {
                const live = await diagrams.getLiveDiagram(id);
                return [id, live.liveDoc.doc] as const;
            }),
        );
        console.log(entries);
        return Object.fromEntries(entries);
    });

    // createEffect(() => {
    //     const subs = subDiagramDocs();
    //     if (!subs) return;
    //     const model = props.liveDiagram.liveModel.liveDoc.doc;
    //     if (!model) return;
    //     const diagramDoc = props.liveDiagram.liveDoc.doc;
    //     const out = ThDEC.simulatePode(model, diagramDoc, subs);
    // });

    // const scalars = createMemo<QualifiedName[]>(
    //     () =>
    //         elaboratedModel()?.morGeneratorsWithType({
    //             tag: "Hom",
    //             content: { tag: "Basic", content: "Object" },
    //         }) ?? [],
    // );

    // const variables = (): QualifiedName[] => elaboratedDiagram()?.obGenerators() ?? [];

    // const scalarSchema: ColumnSchema<QualifiedName>[] = [
    //     {
    //         contentType: "string",
    //         header: true,
    //         name: "Scalar constant",
    //         content: (id) => elaboratedModel()?.morGeneratorLabel(id)?.join(".") ?? "",
    //     },
    //     createNumericalColumn({
    //         name: "Value",
    //         data: (id) => props.content.scalars[id],
    //         setData: (id, value) =>
    //             props.changeContent((content) => {
    //                 content.scalars[id] = value;
    //             }),
    //     }),
    // ];

    // const variableSchema: ColumnSchema<QualifiedName>[] = [
    //     {
    //         contentType: "string",
    //         header: true,
    //         name: "Variable",
    //         content: (id) => elaboratedDiagram()?.obGeneratorLabel(id)?.join(".") ?? "",
    //     },
    //     {
    //         contentType: "enum",
    //         name: "Initial/boundary",
    //         variants() {
    //             if (!props.content.domain) {
    //                 return [];
    //             }
    //             //return options()?.domains.get(props.content.domain)?.initialConditions ?? [];
    //             return [];
    //         },
    //         content: (id) => props.content.initialConditions[id] ?? null,
    //         setContent: (id, value) =>
    //             props.changeContent((content) => {
    //                 if (value === null) {
    //                     delete content.initialConditions[id];
    //                 } else {
    //                     content.initialConditions[id] = value;
    //                 }
    //             }),
    //     },
    //     {
    //         contentType: "boolean",
    //         name: "Plot",
    //         content: (id) => props.content.plotVariables[id] ?? false,
    //         setContent: (id, value) =>
    //             props.changeContent((content) => {
    //                 content.plotVariables[id] = value;
    //             }),
    //     },
    // ];

    // const toplevelSchema: ColumnSchema<null>[] = [
    //     createNumericalColumn({
    //         name: "Duration",
    //         data: (_) => props.content.duration,
    //         validate: (_, data) => data >= 0,
    //         setData: (_, data) =>
    //             props.changeContent((content) => {
    //                 content.duration = data;
    //             }),
    //     }),
    // ];

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
                        //content.mesh = options()?.domains.get(domain)?.meshes[0] ?? null;
                        content.mesh = null;
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

    const podeData = createMemo(() => {
        const model = props.liveDiagram.liveModel.liveDoc.doc;
        const diagram = props.liveDiagram.liveDoc.doc;
        const subDiagrams = subDiagramDocs();
        if (!model || !diagram || !subDiagrams) return undefined;
        try {
            const result = ThDEC.simulatePode(model, diagram, subDiagrams);
            if (!result) return undefined;
            const { pode, constants } = result as { pode: string; constants: string[] };
            return { pode, constants };
        } catch (e) {
            console.error("simulatePode failed:", e);
            return undefined;
        }
    });

    const [constantValues, setConstantValues] = createSignal<Record<string, number>>({});

    const constantSchema: ColumnSchema<string>[] = [
        {
            contentType: "string",
            header: true,
            name: "Constant",
            content: (name) => name,
        },
        createNumericalColumn({
            name: "Value",
            data: (name) => constantValues()[name],
            setData: (name, value) => setConstantValues((prev) => ({ ...prev, [name]: value })),
        }),
    ];

    const [runPayload, setRunPayload] = createSignal<
        { pode: string; constants: Record<string, number> } | undefined
    >(undefined);

    const [res] = createResource(runPayload, async ({ pode, constants }) => {
        const juliaUrl = "http://127.0.0.1:8080";
        setProgress(0);

        const params = new URLSearchParams({ pode });
        for (const [k, v] of Object.entries(constants)) {
            params.set(k, String(v));
        }
        const url = `${juliaUrl}/decapodes-string?${params.toString()}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status ${response.status}`);

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let resultData = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop()!;
            for (const line of lines) {
                if (!line.trim()) continue;
                const msg = JSON.parse(line);
                if ("status" in msg) {
                    setStatus(msg.status);
                    setProgress(null);
                } else if ("progress" in msg) {
                    setStatus(null); // clear status so progress bar shows
                    setProgress(msg.progress);
                }
                if ("data" in msg) resultData = msg.data;
            }
        }

        setProgress(null);
        if (!resultData) throw new Error("No simulation result received");
        return { pode, data: resultData };
    });

    const runSimulation = () => {
        const pd = podeData();
        console.log(pd);
        if (!pd) return;
        setRunPayload({ pode: pd.pode, constants: constantValues() });
    };

    return (
        <div class="simulation">
            <BlockTitle title="Simulation" actions={RestartOrRerunButton()} />
            <Foldable title="Parameters" defaultExpanded>
                <Show when={options()}>
                    {(_options) => {
                        //DomainConfig(options().domains)
                        return DomainConfig(new Map());
                    }}
                </Show>
                <Show when={podeData()}>
                    {(pd) => <FixedTableEditor rows={pd().constants} schema={constantSchema} />}
                </Show>

                <button onClick={runSimulation} disabled={!podeData() || res.loading}>
                    Run Simulation
                </button>
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
                <Match when={res.loading}>
                    <Switch fallback="Running the simulation...">
                        <Match when={status() === "initializing"}>Initializing simulation...</Match>
                        <Match when={status() === "finalizing"}>Finalizing results...</Match>
                        <Match when={progress() !== null}>
                            <div class="simulation-progress">
                                <div class="progress-bar">
                                    <div
                                        class="progress-fill"
                                        style={{ width: `${(progress()! * 100).toFixed(0)}%` }}
                                    />
                                </div>
                                <span class="progress-label">
                                    {(progress()! * 100).toFixed(0)}%
                                </span>
                            </div>
                        </Match>
                    </Switch>
                </Match>
                <Match when={result.error}>
                    {(error) => (
                        <ErrorAlert title="Simulation error">
                            <pre>{error().message}</pre>
                        </ErrorAlert>
                    )}
                </Match>
                <Match when={false}>
                    <ErrorAlert title="Modeling error">
                        {"Cannot run the simulation because the diagram is invalid"}
                    </ErrorAlert>
                </Match>
                <Match when={res()}>
                    {(data) => {
                        console.log("plot data:", JSON.stringify(data().data).slice(0, 200));
                        return <PDEPlot2D data={data().data} />;
                    }}
                </Match>
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
