import { type Accessor, createMemo, createSignal, getOwner, onCleanup } from "solid-js";

export function createDocumentDataView<
    D extends {
        data(): unknown;
        onChange(callback: () => void): () => void;
    },
>(source: Accessor<D>): Accessor<ReturnType<D["data"]>> {
    if (!getOwner()) {
        throw new Error("Document data views must be created within a Solid owner.");
    }
    const current = createMemo(() => {
        const document = source();
        const [data, setData] = createSignal(document.data());
        const unsubscribe = document.onChange(() => setData(() => document.data()));
        onCleanup(unsubscribe);
        return data;
    });
    return () => current()() as ReturnType<D["data"]>;
}
