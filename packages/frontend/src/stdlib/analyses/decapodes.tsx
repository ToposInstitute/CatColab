import type { IKernelConnection } from "@jupyterlab/services/lib/kernel/kernel";
import { Match, Switch, createResource, createSignal, onCleanup } from "solid-js";

import type { JsResult } from "catlog-wasm";
import type { DiagramAnalysisProps } from "../../analysis";
import { IconButton, Warning } from "../../components";
import type { DiagramAnalysisMeta } from "../../theory";
import { type PDEPlotData2D, PDEResultPlot2D } from "../../visualization";

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
    const [simulationResult, setSimulationResult] = createSignal<JsResult<PDEPlotData2D, string>>();

    const [kernel, { refetch: restart }] = createResource(async () => {
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

    const simulate = async (kernel: IKernelConnection) => {
        const simulationData = {
            diagram: props.liveDiagram.formalJudgments(),
            model: props.liveDiagram.liveModel.formalJudgments(),
        };
        const future = kernel.requestExecute({
            code: makeJuliaSimulationCode(simulationData),
        });

        future.onIOPub = (msg) => {
            if (
                msg.header.msg_type === "execute_result" &&
                msg.parent_header.msg_id === future.msg.header.msg_id
            ) {
                const content = msg.content as JsonDataContent<PDEPlotData2D>;
                const data = content["data"]?.["application/json"];
                if (data) {
                    setSimulationResult({ tag: "Ok", content: data });
                }
            }
        };

        const reply = await future.done;
        if (reply.content.status === "error") {
            setSimulationResult({ tag: "Err", content: reply.content.evalue });
        } else if (reply.content.status !== "ok") {
            // Execution request was aborted.
            setSimulationResult(undefined);
        }
    };

    return (
        <div class="simulation">
            <div class={baseStyles.panel}>
                <span class={baseStyles.title}>Simulation</span>
                <span class={baseStyles.filler} />
                <Switch>
                    <Match when={kernel.loading}>
                        <IconButton>
                            <Loader size={16} />
                        </IconButton>
                    </Match>
                    <Match when={kernel.error}>
                        <IconButton onClick={restart} tooltip="Restart the AlgebraicJulia service">
                            <RotateCcw size={16} />
                        </IconButton>
                    </Match>
                    <Match when={kernel()}>
                        {(kernel) => (
                            <IconButton
                                onClick={() => simulate(kernel())}
                                tooltip="Re-run the simulation"
                            >
                                <RotateCcw size={16} />
                            </IconButton>
                        )}
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
                <Match when={kernel()}>
                    <PDEResultPlot2D result={simulationResult()} />
                </Match>
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
