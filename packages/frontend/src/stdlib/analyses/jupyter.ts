import type { ServerConnection } from "@jupyterlab/services";
import type { IKernelConnection, IKernelOptions } from "@jupyterlab/services/lib/kernel/kernel";
import {
    type Accessor,
    type Resource,
    type ResourceReturn,
    createResource,
    onCleanup,
} from "solid-js";

type ResourceRefetch<T> = ResourceReturn<T>[1]["refetch"];

type ServerSettings = Parameters<typeof ServerConnection.makeSettings>[0];

/** Create a Jupyter kernel in a reactive context.

Returns a kernel as a Solid.js resource and a callback to restart the kernel.
The kernel is automatically shut down when the component is unmounted.
 */
export function createKernel(
    serverOptions: ServerSettings,
    kernelOptions: IKernelOptions,
): [Resource<IKernelConnection>, ResourceRefetch<IKernelConnection>] {
    const [kernel, { refetch: restartKernel }] = createResource(async () => {
        const jupyter = await import("@jupyterlab/services");

        const serverSettings = jupyter.ServerConnection.makeSettings(serverOptions);

        const kernelManager = new jupyter.KernelManager({ serverSettings });
        const kernel = await kernelManager.startNew(kernelOptions);

        return kernel;
    });

    onCleanup(() => kernel()?.shutdown());

    return [kernel, restartKernel];
}

/** Execute code in a Jupyter kernel and retrieve JSON data reactively.

Returns the post-processed data as a Solid.js resource and a callback to rerun
the computation.

The resource depends reactively on the kernel: if the kernel changes, the code
will be automatically re-executed. It does *not* depend reactively on the code.
If the code changes, it must be rerun manually.
 */
export function executeAndRetrieve<S, T>(
    kernel: Accessor<IKernelConnection | undefined>,
    executeCode: Accessor<string | undefined>,
    postprocess: (data: S) => T,
): [Resource<T | undefined>, ResourceRefetch<T>] {
    const [data, { refetch: reexecute }] = createResource(kernel, async (kernel) => {
        // Request that kernel execute code, if defined.
        const code = executeCode();
        if (code === undefined) {
            return undefined;
        }
        const future = kernel.requestExecute({ code });

        // Set up handler for result from kernel.
        let result: { data: S } | undefined;
        future.onIOPub = (msg) => {
            if (
                msg.header.msg_type === "execute_result" &&
                msg.parent_header.msg_id === future.msg.header.msg_id
            ) {
                const content = msg.content as JsonDataContent<S>;
                const data = content["data"]?.["application/json"];
                if (data !== undefined) {
                    result = { data };
                }
            }
        };

        // Wait for execution to finish and process result.
        const reply = await future.done;
        if (reply.content.status === "abort") {
            throw new Error("Execution was aborted");
        }
        if (reply.content.status === "error") {
            // Trackback list already includes `reply.content.evalue`.
            const msg = reply.content.traceback.join("\n");
            throw new Error(msg);
        }
        if (result === undefined) {
            throw new Error("Data was not received from the kernel");
        }
        return postprocess(result.data);
    });

    return [data, reexecute];
}

/** JSON data returned from a Jupyter kernel. */
type JsonDataContent<T> = {
    data?: {
        "application/json"?: T;
    };
};
