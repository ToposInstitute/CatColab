import { SessionManager, type ServerConnection } from "@jupyterlab/services";
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
        const t0 = Date.now();
        const jupyter = await import("@jupyterlab/services");

        const serverSettings = jupyter.ServerConnection.makeSettings(serverOptions);

        // const kernelManager = new jupyter.KernelManager({ serverSettings });
        // const kernel = await kernelManager.startNew(kernelOptions);

        const kernelManager = new jupyter.KernelManager({ serverSettings });
        // const kernel = await kernelManager.startNew(kernelOptions);
        const sessionManager = new SessionManager({
            serverSettings,
            kernelManager,
            standby: "never", // don't background-pause in Node
        });

        const session = await sessionManager.startNew({
            name: "remote-api",
            path: "remote-api.ipynb",
            type: "notebook",
            kernel: { name: "julia-1.11" },
        });

        const kernel = session.kernel!;
        kernel.anyMessage.connect((_, msg) => {
            console.log("ANY", (Date.now() - t0) / 1000, msg.direction, msg.msg.header.msg_type);
        });

        return kernel;
    });

    onCleanup(() => kernel()?.shutdown());

    return [kernel, restartKernel];
}

/** Create a Julia kernel in a reactive context. */
export function createJuliaKernel(serverOptions: ServerSettings) {
    // XXX: How do we know...
    // - which Julia version to use?
    // - whether to use the standard kernel or one with our custom sys image?
    // For now, we are omitting the kernel name completely and thus assuming
    // that the correct default kernel has been set on the Jupyter server.
    // Obviously this approach will not extend to multiple languages.
    return createKernel(serverOptions, {
        //name: "julia-1.11",
    });
}

/** Execute code in a Jupyter kernel and retrieve JSON data reactively.

Assumes that the computation will return JSON data using the "application/json"
MIME type in Jupyter. Returns the post-processed data as a Solid.js resource and
a callback to rerun the computation.

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
                msg.header.msg_type === "display_data" &&
                msg.parent_header.msg_id === future.msg.header.msg_id
            ) {
                const content = msg.content as JsonDataContent<S>;
                const data = content["data"]?.["application/json"];
                if (data) {
                    result = { data: JSON.parse(data as any) };
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
