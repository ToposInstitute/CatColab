import { Match, Switch, createResource, onCleanup } from "solid-js";

import type { DiagramAnalysisProps } from "../../analysis";
import { ErrorAlert, IconButton, Warning } from "../../components";
import { fromCatlogDiagram } from "../../diagram";
import type { DiagramAnalysisMeta } from "../../theory";
import { PDEPlot2D, type PDEPlotData2D } from "../../visualization";

import Loader from "lucide-solid/icons/loader";
import RotateCcw from "lucide-solid/icons/rotate-ccw";

import baseStyles from "./base_styles.module.css";
import "./simulation.css";

type JupyterSettings = {
    baseUrl?: string;
    token?: string;
};

export function configureDecapodes(options: {
    id?: string;
    name?: string;
    description?: string;
}): DiagramAnalysisMeta<JupyterSettings> {
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
        initialContent: () => ({}),
    };
}

export function Decapodes(props: DiagramAnalysisProps<JupyterSettings>) {
    const [kernel, { refetch: restartKernel }] = createResource(async () => {
        const jupyter = await import("@jupyterlab/services");

        const serverSettings = jupyter.ServerConnection.makeSettings({
            baseUrl: props.content.baseUrl ?? "http://127.0.0.1:8888",
            token: props.content.token ?? "",
        });

        const kernelManager = new jupyter.KernelManager({ serverSettings });
        const kernel = await kernelManager.startNew({ name: "julia-1.11" });

        const future = kernel.requestExecute({ code: initJuliaCode });
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
        const validatedDiagram = props.liveDiagram.validatedDiagram();
        if (validatedDiagram?.result.tag !== "Ok") {
            return undefined;
        }
        const simulationData = {
            diagram: fromCatlogDiagram(validatedDiagram.diagram, (id) =>
                props.liveDiagram.objectIndex().map.get(id),
            ),
            model: props.liveDiagram.liveModel.formalJudgments(),
        };

        // Request that kernel perform simulation with the given data.
        const future = kernel.requestExecute({
            code: makeJuliaSimulationCode(simulationData),
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

    return (
        <div class="simulation">
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
                <Match when={result()}>{(data) => <PDEPlot2D data={data()} />}</Match>
            </Switch>
        </div>
    );
}

type JsonDataContent<T> = {
    data?: {
        "application/json"?: T;
    };
};

const initJuliaCode = `
import IJulia
IJulia.register_jsonmime(MIME"application/json"())

using AlgebraicJuliaService
`;

const makeJuliaSimulationCode = (data: unknown) => `
system = System(raw"""${JSON.stringify(data)}""");

simulator = evalsim(system.pode);
f = simulator(system.dualmesh, default_dec_generate, DiagonalHodge());

soln = run_sim(f, system.init, 100.0, ComponentArray(k=0.5,));

JsonValue(SimResult(soln, system.dualmesh))
`;
