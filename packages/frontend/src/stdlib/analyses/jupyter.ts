import { type ServerConnection, SessionManager } from "@jupyterlab/services";
import type { IKernelConnection, IKernelOptions } from "@jupyterlab/services/lib/kernel/kernel";
import type { ISessionConnection } from "@jupyterlab/services/lib/session/session";
import {
    type Accessor,
    createResource,
    onCleanup,
    type Resource,
    type ResourceReturn,
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
    let session: ISessionConnection | undefined;

    const [kernel, { refetch: restartKernel }] = createResource(async () => {
        const jupyter = await import("@jupyterlab/services");

        const serverSettings = jupyter.ServerConnection.makeSettings(serverOptions);

        const kernelManager = new jupyter.KernelManager({ serverSettings });
        const sessionManager = new SessionManager({
            serverSettings,
            kernelManager,
        });

        session = await sessionManager.startNew({
            name: "remote-api",
            path: "remote-api.ipynb",
            type: "notebook",
            kernel: kernelOptions,
        });

        if (!session.kernel) {
            throw new Error("session has not kernel?");
        }

        const kernel = session.kernel;

        // Useful for debugging jupyter stuff
        // const t0 = Date.now();
        // kernel.anyMessage.connect((_, msg) => {
        //     console.log(
        //         "[Jupyter message]",
        //         (Date.now() - t0) / 1000,
        //         msg.direction,
        //         msg.msg.header.msg_type,
        //     );
        // });

        return kernel;
    });

    onCleanup(() => {
        if (session) {
            session.shutdown();
        }
    });

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
        // XXX: we are abusing message types to exfiltrate data
        let result: { data: S } | undefined;
        let streamedResult = "";
        const error: string | undefined = undefined;
        future.onIOPub = (msg) => {
            if (msg.parent_header.msg_id !== future.msg.header.msg_id) {
                return;
            }

            // this catches any print statements, which may be broken up into an arbitrary number of
            // messages. To return large data stringify the JSON result and `println` it. If this method is used,
            // ensure that no other `print` statements are used, as they will also be collected here.
            if (msg.header.msg_type === "stream") {
                // biome-ignore lint/suspicious/noExplicitAny: this should type narrow, but doesn't
                const text = (msg.content as any).text;
                if (text) {
                    streamedResult += text;
                }
            }

            // In this case msg_type "stream" will be collected but not used. This only works for
            // relatively small amounts of data, it could be the case that nothing should be returned
            // like this. The json serialization done by IJulia appears to be cripplingly slow for
            // unknown reasons.
            //
            // This allows returning something while still being able to inspect print statements from
            // the client.
            if (msg.header.msg_type === "execute_result") {
                const content = msg.content as JsonDataContent<S>;
                const data = content["data"]?.["application/json"];
                if (data) {
                    result = { data };
                }
            }
        };

        // Wait for execution to finish and process result.
        const reply = await future.done;

        if (error) {
            throw new Error(error);
        }

        if (reply.content.status === "abort") {
            throw new Error("Execution was aborted");
        }
        if (reply.content.status === "error") {
            // Trackback list already includes `reply.content.evalue`.
            const msg = reply.content.traceback.join("\n");
            throw new Error(msg);
        }

        if (!result && streamedResult) {
            result = { data: JSON.parse(streamedResult) };
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
