import { Match, Switch, createMemo, createResource, onCleanup } from "solid-js";
import { isMatching } from "ts-pattern";

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
import { type DiagramJudgment, type LiveDiagramDocument, fromCatlogDiagram } from "../../diagram";
import type { ModelJudgment, MorphismDecl } from "../../model";
import type { DiagramAnalysisMeta } from "../../theory";
import { PDEPlot2D, type PDEPlotData2D } from "../../visualization";

import Loader from "lucide-solid/icons/loader";
import RotateCcw from "lucide-solid/icons/rotate-ccw";

import baseStyles from "./base_styles.module.css";
import "./simulation.css";

/** Configuration for a Decapodes analysis of a diagram. */
export type DecapodesContent = JupyterSettings & {
    scalars: Record<string, number>;
};

type JupyterSettings = {
    baseUrl?: string;
    token?: string;
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
            scalars: {},
        }),
    };
}

/** Analyze a DEC diagram by performing a simulation using Decapodes.jl.
 */
export function Decapodes(props: DiagramAnalysisProps<DecapodesContent>) {
    const [kernel, { refetch: restartKernel }] = createResource(async () => {
        const jupyter = await import("@jupyterlab/services");

        const serverSettings = jupyter.ServerConnection.makeSettings({
            baseUrl: props.content.baseUrl ?? "http://127.0.0.1:8888",
            token: props.content.token ?? "",
        });

        const kernelManager = new jupyter.KernelManager({ serverSettings });
        const kernel = await kernelManager.startNew({ name: "julia-1.11" });

        const future = kernel.requestExecute({ code: initCode });
        const reply = await future.done;

        if (reply.content.status === "error") {
            await kernel.shutdown();
            throw new Error(reply.content.evalue);
        }

        return kernel;
    });

    onCleanup(() => kernel()?.shutdown());

    const maybeKernel = () => (kernel.error ? undefined : kernel());

    const [result, { refetch: rerunSimulation }] = createResource(maybeKernel, async (kernel) => {
        // Construct the data to send to kernel.
        const simulationData = makeSimulationData(props.liveDiagram, props.content);
        console.log(JSON.parse(JSON.stringify(simulationData))); // XXX
		if (!simulationData) {
            return undefined;
        }

        // Request that the kernel run a simulation with the given data.
        const future = kernel.requestExecute({
            code: makeSimulationCode(simulationData),
        });

        // Handle output from the kernel.
        let result: PDEPlotData2D | undefined;
        future.onIOPub = (msg) => {
            if (
                msg.header.msg_type === "execute_result" &&
                msg.parent_header.msg_id === future.msg.header.msg_id
            ) {
                const content = msg.content as JsonDataContent<PDEPlotData2D>;
                result = content["data"]?.["application/json"];
            }
        };

        const reply = await future.done;
        if (reply.content.status === "error") {
            throw new Error(reply.content.evalue);
        }
        if (!result) {
            throw new Error("Result not received from the simulator");
        }
        return result;
    });

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

    const header = () => (
        <div class={baseStyles.panel}>
            <span class={baseStyles.title}>Simulation</span>
            <span class={baseStyles.filler} />
            <Switch>
                <Match when={kernel.loading || result.loading}>
                    <IconButton>
                        <Loader size={16} />
                    </IconButton>
                </Match>
                <Match when={kernel.error}>
                    <IconButton
                        onClick={restartKernel}
                        tooltip="Restart the AlgebraicJulia service"
                    >
                        <RotateCcw size={16} />
                    </IconButton>
                </Match>
                <Match when={true}>
                    <IconButton onClick={rerunSimulation} tooltip="Re-run the simulation">
                        <RotateCcw size={16} />
                    </IconButton>
                </Match>
            </Switch>
        </div>
    );

    return (
        <div class="simulation">
            <Foldable header={header()}>
                <div class="parameters">
                    <FixedTableEditor rows={scalarDecls()} schema={scalarSchema} />
                </div>
            </Foldable>
            <Switch>
                <Match when={kernel.loading}>{"Loading the AlgebraicJulia service..."}</Match>
                <Match when={kernel.error}>
                    {(error) => (
                        <Warning title="Failed to load AlgebraicJulia service">
                            {error().message}
                        </Warning>
                    )}
                </Match>
                <Match when={result.loading}>{"Running the simulation..."}</Match>
                <Match when={result.error}>
                    {(error) => <ErrorAlert title="Simulation error">{error().message}</ErrorAlert>}
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

/** JSON data returned from a Jupyter kernel. */
type JsonDataContent<T> = {
    data?: {
        "application/json"?: T;
    };
};

/** Data send to the Julia kernel defining a simulation. */
type SimulationData = {
    /** Judgments defining the diagram, including inferred ones. */
    diagram: Array<DiagramJudgment>;

    /** Judgments defining the model. */
    model: Array<ModelJudgment>;

    /** Mapping from IDs of scalar operations to numerical values. */
    scalars: Record<string, number>;
};

/** Julia code run after kernel is started. */
const initCode = `
import IJulia
IJulia.register_jsonmime(MIME"application/json"())

using AlgebraicJuliaService
`;

/** Julia code run to perform a simulation. */
const makeSimulationCode = (data: SimulationData) => `
system = System(raw"""${JSON.stringify(data)}""");

simulator = evalsim(system.pode);
f = simulator(system.dualmesh, generate, DiagonalHodge());

soln = run_sim(f, system.init, 100.0, ComponentArray(k=0.5,));

JsonValue(SimResult(soln, system.dualmesh))
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
    return {
        diagram: fromCatlogDiagram(validatedDiagram.diagram, (id) =>
            liveDiagram.objectIndex().map.get(id),
        ),
        model: liveDiagram.liveModel.formalJudgments(),
        scalars: content.scalars,
    };
};
