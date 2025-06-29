import { AnyDocumentId, Repo } from "@automerge/automerge-repo";
import { Accessor, createContext, createMemo, JSX, useContext } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

const LIVEDOC_CONTEXT = createContext<{
    repo: Repo;
    cache: Map<AnyDocumentId, LiveDoc<unknown>>;
}>();

function createLiveDoc<T extends object>(
    repo: Repo,
    id: AnyDocumentId,
): LiveDoc<T> | undefined {
    const docHandle = repo.find<T>(id);

    const [store, setStore] = createStore<T>({} as T);

    docHandle.on("change", ({ doc }) => {
        setStore(reconcile(doc));
    });

    return {
        value: store,
        update: (f) => docHandle.change(f),
    };
}

export function useLiveDoc<T extends object>(
    id: () => AnyDocumentId,
): Accessor<LiveDoc<T> | undefined> {
    const livedocs = useContext(LIVEDOC_CONTEXT);

    if (livedocs === undefined) {
        throw new Error("must provide repo context");
    }

    return createMemo(() => {
        const doc = livedocs.cache.get(id()) as LiveDoc<T>;

        if (doc === undefined) {
            const doc = createLiveDoc<T>(livedocs.repo, id());
            if (doc !== undefined) {
                livedocs.cache.set(id(), doc);
            }
            return doc;
        } else {
            return doc;
        }
    });
}

export function useRepo(): Repo {
    const livedocs = useContext(LIVEDOC_CONTEXT);

    if (livedocs === undefined) {
        throw new Error("must provide repo context");
    }

    return livedocs.repo;
}

export type LiveDoc<T> = {
    value: T;
    update: (f: (d: T) => void) => void;
};

export function LiveDocProvider(
    props: { repo: Repo; children?: JSX.Element },
): JSX.Element {
    const cache = new Map();
    return (
        <LIVEDOC_CONTEXT.Provider value={{ repo: props.repo, cache }}>
            {props.children}
        </LIVEDOC_CONTEXT.Provider>
    );
}
