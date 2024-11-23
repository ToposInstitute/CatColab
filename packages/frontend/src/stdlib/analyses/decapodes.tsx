import type { IKernelConnection } from "@jupyterlab/services/lib/kernel/kernel";
import { Show, createResource, createSignal, onCleanup } from "solid-js";

import type { JsResult } from "catlog-wasm";
import type { DiagramAnalysisProps } from "../../analysis";
import { IconButton } from "../../components";
import type { DiagramAnalysisMeta } from "../../theory";
import { type PDEPlotData2D, PDEResultPlot2D } from "../../visualization";

import Loader from "lucide-solid/icons/loader";
import RotateCw from "lucide-solid/icons/rotate-cw";

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

    const [kernel] = createResource(async () => {
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
            // TODO: Handle this error without raising in console.
            const msg = `${reply.content.ename}: ${reply.content.evalue}`;
            throw new Error(`Failed to initialize AlgebraicJulia service: ${msg}`);
        }

        return kernel;
    });

    onCleanup(() => kernel()?.shutdown());

    const simulate = async (kernel: IKernelConnection) => {
        const requestData = {
            diagram: props.liveDiagram.formalJudgments(),
            model: props.liveDiagram.liveModel.formalJudgments(),
        };
        const future = kernel.requestExecute({
            code: `
			system = System(raw"""${JSON.stringify(requestData)}""");

			simulator = evalsim(system.pode);
			f = simulator(system.mesh, default_dec_generate, DiagonalHodge());

			soln = run_sim(f, system.init, 10.0, ComponentArray(k=0.5,));

			JsonValue(SimResult(soln, system.mesh))
			#JsonValue([1.0, 2.0, 3.0, 4.0])
			`,
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
            const msg = `${reply.content.ename}: ${reply.content.evalue}`;
            setSimulationResult({ tag: "Err", content: msg });
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
                <Show
                    when={kernel()}
                    fallback={
                        <IconButton tooltip="Loading the AlgebraicJulia service">
                            <Loader size={16} />
                        </IconButton>
                    }
                >
                    {(kernel) => (
                        <IconButton
                            onClick={() => simulate(kernel())}
                            tooltip="Re-run the simulation"
                        >
                            <RotateCw size={16} />
                        </IconButton>
                    )}
                </Show>
            </div>
            <PDEResultPlot2D result={simulationResult()} />
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
