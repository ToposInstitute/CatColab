import { createComputed, createRoot, createSignal } from "solid-js";
import { describe, expect, test, vi } from "vitest";

import {
    createBinder,
    createInMemoryStore,
    type DeepReadonly,
    type DocInfo,
    type MetaDocument,
    type MetaDocumentData,
    type RelatedDocuments,
    type RelatedDocumentsOptions,
} from "catcolab-documents";
import { createRelatedDocumentsView } from "../src";

const origin = { id: "origin", version: null };
const other = { id: "other", version: null };
const relatedId = "00000000-0000-0000-0000-000000000000";
const relation = { refId: new Uint8Array(16), relationType: "instance-of" };

function documentInfo(name: string): DocInfo {
    return {
        name,
        typeName: "model",
        createdAt: 0,
        deletedAt: null,
        dependsOn: [],
        usedBy: [],
    };
}

function fixture() {
    const listeners = new Set<() => void>();
    const data: MetaDocumentData = {
        profile: { username: null, displayName: null },
        knownUsers: {},
        documents: {
            [origin.id]: { ...documentInfo("Origin"), usedBy: [relation] },
            [other.id]: { ...documentInfo("Other"), usedBy: [relation] },
            [relatedId]: documentInfo("Related"),
        },
    };
    const getSnapshot = vi.fn<MetaDocument["data"]>(() => data);
    const subscribe = vi.fn<MetaDocument["onChange"]>((callback) => {
        listeners.add(callback);
        return () => {
            listeners.delete(callback);
        };
    });
    return {
        binder: createBinder({
            ...createInMemoryStore(),
            meta: { data: getSnapshot, onChange: subscribe },
        }),
        data,
        getSnapshot,
        subscribe,
        listeners,
        notify() {
            for (const callback of listeners) {
                callback();
            }
        },
    };
}

describe("Solid related documents", () => {
    test("requeries on metadata changes but only publishes changed results", () => {
        const { binder, data, getSnapshot, notify, listeners } = fixture();
        const observed = vi.fn<(related: DeepReadonly<RelatedDocuments>) => void>();
        const dispose = createRoot((dispose) => {
            const view = createRelatedDocumentsView(binder, () => origin, { direction: "used-by" });
            createComputed(() => observed(view()));
            return dispose;
        });
        try {
            expect(getSnapshot).toHaveBeenCalledOnce();
            expect(observed).toHaveBeenCalledOnce();
            data.documents.unrelated = documentInfo("Unrelated");
            notify();
            expect(getSnapshot).toHaveBeenCalledTimes(2);
            expect(observed).toHaveBeenCalledOnce();

            data.documents[relatedId] = documentInfo("Renamed");
            notify();
            expect(observed).toHaveBeenCalledTimes(2);
            expect(observed.mock.lastCall?.[0]["instance-of"]).toEqual([
                {
                    ref: { id: relatedId, version: null },
                    name: "Renamed",
                    typeName: "model",
                    createdAt: 0,
                },
            ]);
        } finally {
            dispose();
        }
        expect(listeners.size).toBe(0);
        notify();
        expect(getSnapshot).toHaveBeenCalledTimes(3);
    });

    test("updates for ref and option changes without resubscribing", () => {
        const { binder, subscribe, listeners } = fixture();
        const owner = createRoot((dispose) => {
            const [ref, setRef] = createSignal(other);
            const [options, setOptions] = createSignal<RelatedDocumentsOptions>({
                direction: "both",
            });
            const view = createRelatedDocumentsView(binder, ref, options);
            return { view, setRef, setOptions, dispose };
        });
        try {
            expect(owner.view()["instance-of"]).toHaveLength(1);
            owner.setRef({ id: "missing", version: null });
            expect(owner.view()["instance-of"]).toEqual([]);
            owner.setRef(origin);
            expect(owner.view()["instance-of"]).toHaveLength(1);
            owner.setOptions({ direction: "depends-on" });
            expect(owner.view()["instance-of"]).toEqual([]);
            expect(subscribe).toHaveBeenCalledOnce();
            expect(listeners.size).toBe(1);
        } finally {
            owner.dispose();
        }
        expect(listeners.size).toBe(0);
    });
});
