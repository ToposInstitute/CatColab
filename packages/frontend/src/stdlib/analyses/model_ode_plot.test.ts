import { createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";
import WebWorker from "web-worker";

import type { LiveModelDoc } from "../../model";

// @ts-expect-error - test-only remap to Solid client runtime path
vi.mock("solid-js", async () => await import("solid-js/dist/solid.js"));

type OutboundRequest = {
    theoryId: string;
    refId: string;
};

class TestWorker extends WebWorker {
    static outbound: OutboundRequest[] = [];

    constructor(_url: string | URL, _options?: WorkerOptions) {
        super(new URL("./test_workers/ready_err_worker.js", import.meta.url), {
            type: "module",
        });
    }

    override postMessage(
        message: unknown,
        options?: StructuredSerializeOptions | Transferable[],
    ): void {
        if (message && typeof message === "object") {
            const request = message as Partial<OutboundRequest>;
            if (typeof request.theoryId === "string" && typeof request.refId === "string") {
                TestWorker.outbound.push({
                    theoryId: request.theoryId,
                    refId: request.refId,
                });
            }
        }
        if (Array.isArray(options)) {
            super.postMessage(message, options);
        } else {
            super.postMessage(message, options);
        }
    }
}

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
    TestWorker.outbound = [];
});

describe("createModelODEPlot", () => {
    test("uses latest theory/ref after doc switch without remount", async () => {
        vi.stubGlobal("Worker", TestWorker as unknown as typeof Worker);

        const { createModelODEPlot } = await import("./model_ode_plot");

        const fakeModel = {
            obGenerators: () => [] as string[],
            obGeneratorLabel: (_id: string) => undefined,
        };

        const liveDoc = {
            doc: {
                theory: "theory-a",
                notebook: {},
            },
            docHandle: {
                documentId: "ref-a",
            },
        };

        const liveModel = {
            type: "model",
            liveDoc,
            theory: () => undefined,
            elaboratedModel: () => undefined,
            validatedModel: () => ({ tag: "Valid", model: fakeModel }),
        } as unknown as LiveModelDoc;

        const [params, setParams] = createSignal<unknown>({ alpha: 1 });

        let dispose = () => {};
        createRoot((d) => {
            dispose = d;
            createModelODEPlot(liveModel, "linear-ode", params);
        });

        await sleep(300);

        expect(TestWorker.outbound).toHaveLength(1);
        expect(TestWorker.outbound[0]).toEqual({
            theoryId: "theory-a",
            refId: "ref-a",
        });

        liveDoc.doc.theory = "theory-b";
        liveDoc.docHandle.documentId = "ref-b";
        setParams({ alpha: 2 });

        await sleep(300);

        expect(TestWorker.outbound).toHaveLength(2);
        expect(TestWorker.outbound[1]).toEqual({
            theoryId: "theory-b",
            refId: "ref-b",
        });

        dispose();
    });
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
