import type { ServerConnection } from "@jupyterlab/services";
import type { IKernelConnection, IKernelOptions } from "@jupyterlab/services/lib/kernel/kernel";
import { type Resource, type ResourceReturn, createResource, onCleanup } from "solid-js";

type ResourceRefetch<T> = ResourceReturn<T>[1]["refetch"];

type ServerSettings = Parameters<typeof ServerConnection.makeSettings>[0];

/** Create a Jupyter kernel as a Solid resource.

Returns a handle to the resource and a callback to restart the kernel. The
kernel is automatically shut down when the component is unmounted.
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
