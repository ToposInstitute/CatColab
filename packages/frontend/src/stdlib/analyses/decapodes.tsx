import type { IKernelConnection } from "@jupyterlab/services/lib/kernel/kernel";
import { Show, createResource, createSignal, onCleanup } from "solid-js";

import type { DiagramAnalysisProps } from "../../analysis";
import { IconButton } from "../../components";
import type { DiagramAnalysisMeta } from "../../theory";

import Loader from "lucide-solid/icons/loader";
import RotateCw from "lucide-solid/icons/rotate-cw";

import baseStyles from "./base_styles.module.css";

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
    const [simulationData, setSimulationData] = createSignal<number[]>();

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
            const msg = `${reply.content.ename}: ${reply.content.evalue}`;
            throw new Error(`Failed to import AlgebraicJulia service: ${msg}`);
        }

        return kernel;
    });

    onCleanup(() => kernel()?.shutdown());

    const simulate = async (kernel: IKernelConnection) => {
        const diagramData = {
            diagram: props.liveDiagram.formalJudgments(),
            model: props.liveDiagram.liveModel.formalJudgments(),
        };
        const future = kernel.requestExecute({
            code: `simulate_decapode(raw"""${JSON.stringify(diagramData)}""")`,
        });

        future.onIOPub = (msg) => {
            if (
                msg.header.msg_type === "execute_result" &&
                msg.parent_header.msg_id === future.msg.header.msg_id
            ) {
                const content = msg.content as JsonDataContent<number[]>;
                setSimulationData(content["data"]?.["application/json"]);
            }
        };

        const reply = await future.done;
        if (reply.content.status !== "ok") {
            setSimulationData(undefined);
        }
        if (reply.content.status === "error") {
            const msg = `${reply.content.ename}: ${reply.content.evalue}`;
            throw new Error(`Error running simulation: ${msg}`);
        }
    };

    return (
        <div class="decapodes">
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
            <div class="results">{simulationData()}</div>
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
