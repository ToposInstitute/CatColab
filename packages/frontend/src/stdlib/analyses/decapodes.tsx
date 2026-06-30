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
    ProgressBar,
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

    const juliaUrl = "http://127.0.0.1:8080"; // TODO replace with vite
    const [options] = createResource<SimulationOptions>(async () => {
        const response = await fetch(`${juliaUrl}/decapodes-options`);
        if (!response.ok) throw new Error(`HTTP error! status ${response.status}`);
        return (await response.json()) as SimulationOptions;
    });

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

    // this is a shim to get nested diagrams
    const [subDiagramDocs] = createResource(instantiatedRefIds, async (refIds) => {
        const entries = await Promise.all(
            refIds.map(async (id) => {
                const live = await diagrams.getLiveDiagram(id);
                return [id, live.liveDoc.doc] as const;
            }),
        );
        return Object.fromEntries(entries);
    });

    // TODO these should come from the objects of an elaborated document
    const icRows = ["n", "w", "Hydrodynamics_dX"];
    const icSchema: ColumnSchema<string>[] = [
        {
            contentType: "string",
            header: true,
            name: "State variable",
            content: (name) => name,
        },
        {
            contentType: "enum",
            name: "Initial condition",
            variants: () => {
                const mesh = props.content.mesh;
                if (!mesh) return [];
                return options()?.mesh_info[mesh].ics.map((ic) => ic.ic) ?? [];
            },
            content: (name) => props.content.initialConditions[name] ?? null,
            setContent: (name, value) =>
                props.changeContent((content) => {
                    if (value === null) {
                        delete content.initialConditions[name];
                    } else {
                        content.initialConditions[name] = value;
                    }
                }),
        },
    ];

    const [icValues, setICValues] = createSignal<Record<string, Record<string, number>>>({});

    const selectedIC = (varName: string): IC | undefined => {
        const mesh = props.content.mesh,
            chosen = props.content.initialConditions[varName];
        if (!mesh || !chosen) return undefined;
        return options()?.mesh_info[mesh].ics.find((ic) => ic.ic === chosen);
    };

    const icFieldSchema = (
        varName: string,
        defaults: Record<string, number>,
    ): ColumnSchema<string>[] => [
        { contentType: "string", header: true, name: "Parameter", content: (f) => f },
        createNumericalColumn({
            name: "Value",
            data: (f) => icValues()[varName]?.[f],
            default: (f) => defaults[f],
            setData: (f, v) => setICValues((p) => ({ ...p, [varName]: { ...p[varName], [f]: v } })),
        }),
    ];

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

    const toplevelSchema: ColumnSchema<null>[] = [
        createNumericalColumn({
            name: "Duration",
            data: (_) => props.content.duration,
            validate: (_, data) => data >= 0,
            default: 10,
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

    const [meshParams, setMeshParams] = createSignal<Record<string, number>>({});

    const fieldSchema = (default_value: Record<string, unknown>): ColumnSchema<string>[] => [
        {
            contentType: "string",
            header: true,
            name: "Field",
            content: (field) => field,
        },
        createNumericalColumn({
            name: "Value",
            data: (field) => meshParams()[field],
            default: (field) => default_value[field],
            setData: (field, v) => setMeshParams((prev) => ({ ...prev, [field]: v })),
        }),
    ];

    const fieldNames = (mesh: string): string[] =>
        Object.keys(options()?.mesh_info[mesh].specs ?? {});

    const [runPayload, setRunPayload] = createSignal<
        { pode: string; constants: Record<string, number>; duration: number } | undefined
    >(undefined);

    async function* ndjson(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamMsg> {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const lines = buf.split("\n");
                buf = lines.pop()!;
                for (const line of lines) if (line.trim()) yield JSON.parse(line) as StreamMsg;
            }
        } finally {
            reader.releaseLock();
        }
    }

    const [res] = createResource(runPayload, async ({ pode, constants, duration }) => {
        setProgress(0);

        const params = new URLSearchParams({ pode });
        for (const [k, v] of Object.entries(constants)) {
            params.set(`constants.${k}`, String(v));
        }
        params.set("mesh", String(props.content.mesh));

        const valid = new Set(fieldNames(String(props.content.mesh)));
        for (const [k, v] of Object.entries(meshParams())) {
            if (valid.has(k)) params.set(`mesh.${k}`, String(v));
        }

        for (const [k, v] of Object.entries(props.content.initialConditions)) {
            params.set(`initialConditions.${k}`, String(v));
        }
        params.set("duration", String(duration));
        const url = `${juliaUrl}/decapodes-string?${params.toString()}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status ${response.status}`);

        let resultData = null;
        for await (const msg of ndjson(response.body!)) {
            if ("status" in msg) setStatus(msg.status);
            if ("progress" in msg) {
                setStatus(null);
                setProgress(msg.progress);
            }
            if ("data" in msg) resultData = msg.data;
        }

        setProgress(null);
        if (!resultData) throw new Error("No simulation result received");
        return { pode, data: resultData };
    });

    const runSimulation = () => {
        const pd = podeData();
        if (!pd) return;
        setRunPayload({
            pode: pd.pode,
            constants: constantValues(),
            duration: props.content.duration ?? 10,
        });
    };

    const isDisabled = () => {
        const isICsAllCompleted = icRows.every((name) => {
            const v = props.content.initialConditions[name];
            return v != null && v !== "";
        });
        !isICsAllCompleted;
    };

    type ICTab = { name: string; ic: IC };

    const icTabs = createMemo<ICTab[]>(() =>
        icRows
            .map((name) => ({ name, ic: selectedIC(name) }))
            .filter((t): t is ICTab => t.ic !== undefined && Object.keys(t.ic.defaults).length > 0),
    );

    const [activeTab, setActiveTab] = createSignal<string | null>(null);

    const effectiveTab = createMemo(() => {
        const tabs = icTabs();
        if (tabs.length === 0) return null;
        const current = activeTab();
        return tabs.some((t) => t.name === current) ? current : tabs[0].name;
    });

    const activeTabData = createMemo(() => icTabs().find((t) => t.name === effectiveTab()));

    return (
        <div class="simulation">
            <BlockTitle title="Simulation" actions={RestartOrRerunButton()} />
            <Foldable title="Parameters" defaultExpanded>
                <Show when={options()}>
                    {(opts) => (
                        <div class="decapodes-domain">
                            <span>Mesh:</span>
                            <select
                                value={props.content.mesh ?? undefined}
                                onInput={(evt) =>
                                    props.changeContent((content) => {
                                        setMeshParams({});
                                        content.mesh = evt.currentTarget.value;
                                        content.initialConditions = {};
                                        setICValues({});
                                    })
                                }
                            >
                                <For each={opts().meshes}>
                                    {(mesh) => <option value={mesh}>{mesh}</option>}
                                </For>
                            </select>
                            <Show when={options() && props.content.mesh}>
                                {(mesh) => {
                                    console.log(icValues());
                                    return (
                                        <FixedTableEditor
                                            rows={fieldNames(mesh())}
                                            schema={fieldSchema(
                                                options()?.mesh_info[mesh()].defaults,
                                            )}
                                        />
                                    );
                                }}
                            </Show>{" "}
                        </div>
                    )}
                </Show>

                <div class="decapodes-domain">
                    <Show when={props.content.mesh}>
                        <FixedTableEditor rows={icRows} schema={icSchema} />
                        <Show when={icTabs().length > 0}>
                            <div class="ic-tabs">
                                <div class="ic-tab-list" role="tablist">
                                    <For each={icTabs()}>
                                        {(tab) => (
                                            <button
                                                type="button"
                                                role="tab"
                                                class="ic-tab"
                                                classList={{ active: effectiveTab() === tab.name }}
                                                aria-selected={effectiveTab() === tab.name}
                                                onClick={() => setActiveTab(tab.name)}
                                            >
                                                {tab.name}
                                            </button>
                                        )}
                                    </For>
                                </div>
                                <Show when={activeTabData()} keyed>
                                    {(tab) => (
                                        <div class="ic-tab-panel" role="tabpanel">
                                            <FixedTableEditor
                                                rows={Object.keys(tab.ic.defaults)}
                                                schema={icFieldSchema(tab.name, tab.ic.defaults)}
                                            />
                                        </div>
                                    )}
                                </Show>
                            </div>
                        </Show>
                    </Show>
                </div>

                <Show when={podeData()}>
                    {(pd) => <FixedTableEditor rows={pd().constants} schema={constantSchema} />}
                </Show>

                <FixedTableEditor rows={[null]} schema={toplevelSchema} />

                <button
                    onClick={runSimulation}
                    disabled={!podeData() || isDisabled() || res.loading}
                >
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
                    <ProgressBar progress={progress} status={status} />
                </Match>
                <Match when={res.error}>
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
                <Match when={res()}>{(data) => <PDEPlot2D data={data().data} />}</Match>
            </Switch>
        </div>
    );
}

type IC = {
    ic: string;
    params: Record<string, number>;
};

type MeshInfo = {
    specs: Record<string, string>;
    defaults: Record<string, number>;
    ics: IC[];
};

/** Options supported by Decapodes, defined by the Julia service. */
type SimulationOptions = {
    meshes: string[];
    mesh_info: Record<string, MeshInfo>;
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
