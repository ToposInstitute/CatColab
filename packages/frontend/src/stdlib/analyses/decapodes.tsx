import { createResource, createSignal, onCleanup } from "solid-js";

import type { DiagramAnalysisProps } from "../../analysis";
import type { DiagramAnalysisMeta } from "../../theory";
import { IconButton } from "../../components";

import RotateCw from "lucide-solid/icons/rotate-cw";

import baseStyles from "./base_styles.module.css";

type JupyterConfig = {
    baseUrl: string;
    token?: string;
};

export function configureDecapodes(options: {
    id: string;
    name: string;
    description?: string;
}): DiagramAnalysisMeta<JupyterConfig> {
    const { id, name, description } = options;
    return {
        id,
        name,
        description,
        component: (props) => <Decapodes {...props} />,
        initialContent: () => ({
            baseUrl: "http://127.0.0.1:8888",
        }),
    };
}

export function Decapodes(props: DiagramAnalysisProps<JupyterConfig>) {
    const [result, setResult] = createSignal<Array<number>>();

    const [kernel] = createResource(async () => {
        const jupyter = await import("@jupyterlab/services");

        const serverSettings = jupyter.ServerConnection.makeSettings({
            baseUrl: props.content.baseUrl,
            token: props.content.token ?? "",
        });

        const kernelManager = new jupyter.KernelManager({ serverSettings });
        const kernel = await kernelManager.startNew({ name: "julia-1.11" });

        // TODO: Load interop package.
        /// kernel.requestExecute({ ... })

        onCleanup(() => kernel.shutdown());

        return kernel;
    });

    const simulate = () => {
        const data = {
            diagram: props.liveDiagram.formalJudgments(),
            model: props.liveDiagram.liveModel.formalJudgments(),
        };
        const future = kernel()?.requestExecute({
            code: `decapodes_main(${JSON.stringify(data)})`,
            //code: "JsonValue([1,2,3])"
        });
    };

    return (
        <div class="decapodes">
            <div class={baseStyles.panel}>
                <span class={baseStyles.title}>{"Decapodes simulation"}</span>
                <span class={baseStyles.filler} />
                <IconButton onClick={simulate} disabled={kernel.loading || kernel.error}>
                    <RotateCw size={16} />
                </IconButton>
            </div>
            <div class="result">
                {result()}
            </div>
        </div>
    )
}
