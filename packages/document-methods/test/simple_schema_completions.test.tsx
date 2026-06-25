/*
 * A simple-schema scenario focused on *completions*, companion to
 * `petri_net_elaborated_consumer`.
 *
 * It reads the *elaborated model* — the `DblModel` from `Notebook.validate()` —
 * to reproduce how the frontend computes autocompletions for a morphism
 * endpoint (`model/object_input.tsx` -> `components/id_input.tsx` ->
 * `ui-components/completions.tsx`):
 *
 *   1. Candidate ids come from `obGeneratorsWithType(obType)`, filtered to the
 *      endpoint's object type (`AttrType` for an `Attr`'s codomain).
 *   2. Each id is labelled with `obGeneratorLabel(id)?.join(".")`.
 *   3. Typed text filters the list to substring matches.
 *   4. Selecting one edits the typed notebook; a `createResource` keyed on the
 *      notebook's cells re-validates reactively into a fresh elaborated model.
 */
/* oxlint-disable unicorn/consistent-function-scoping */
import {
    createBinder,
    type DocumentStore,
    type ModelValidationResult,
} from "catcolab-documents";
import { Attr, AttrType, Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { createResource, createRoot, createSignal, For, Show } from "solid-js";
import { createStore, produce, type SetStoreFunction, unwrap } from "solid-js/store";
import { render } from "solid-js/web";
import { describe, expect, test } from "vitest";

import type { ModelDocument } from "catcolab-document-methods";
import type { DblModel, ObType, QualifiedName } from "catlog-wasm";

type SolidStoreHandle = {
    doc: ModelDocument;
    setDoc: SetStoreFunction<ModelDocument>;
};

const solidStore: DocumentStore<SolidStoreHandle> = {
    createHandle(initialDoc) {
        const [doc, setDoc] = createStore<ModelDocument>(initialDoc as ModelDocument);
        return { doc, setDoc };
    },
    viewDocument: (handle) => handle.doc,
    changeDocument: (handle, fn) => handle.setDoc(produce<ModelDocument>(fn)),
    copyValue: (_handle, value) => structuredClone(unwrap(value)),
    linkForHandle: () => undefined,
    resolveModel: async () => {
        throw new Error("this store cannot resolve model references");
    },
    resolveAnalysis: async () => {
        throw new Error("this store cannot resolve analyses");
    },
};

const solidBinder = createBinder(solidStore);

/**
 * Build the completions for an object type and filter them by the typed text,
 * exactly as the frontend does (`obGeneratorsWithType` + `obGeneratorLabel`):
 * keep the generators whose label contains the text.
 */
function filteredCompletions(model: DblModel, obType: ObType, text: string): QualifiedName[] {
    const label = (id: QualifiedName) => model.obGeneratorLabel(id)?.join(".") ?? "?";
    const needle = text.toLowerCase();
    return model
        .obGeneratorsWithType(obType)
        .filter((id) => label(id).toLowerCase().includes(needle));
}

describe("simple-schema completions consumer", () => {
    test("catcolab-documents, elaborated-model completions", async () => {
        // The endpoint completions list: candidate `AttrType` ids filtered by
        // the typed text, each selectable to edit the morphism's codomain.
        function Completions(props: {
            model: DblModel;
            obType: ObType;
            text: string;
            onSelect: (id: QualifiedName) => void;
        }) {
            return (
                <ul class="completion-list">
                    <For each={filteredCompletions(props.model, props.obType, props.text)}>
                        {(id) => (
                            <li onMouseDown={() => props.onSelect(id)}>
                                {props.model.obGeneratorLabel(id)?.join(".")}
                            </li>
                        )}
                    </For>
                </ul>
            );
        }

        // Build the schema through the typed document API; the elaborated model
        // is derived from it. `Mapping` exists only so the morphism-type filter
        // is meaningful: `obGeneratorsWithType(AttrType)` must exclude entities.
        void Mapping;
        const notebook = solidBinder.createNotebook(SimpleSchema, { name: "Company schema" });
        const person = notebook.add(Entity, { name: "Person" });
        const str = notebook.add(AttrType, { name: "String" });
        notebook.add(AttrType, { name: "Integer" });
        notebook.add(AttrType, { name: "Boolean" });
        const attr = notebook.add(Attr, { name: "name", from: person, to: str });

        // Validation runs reactively: the resource re-elaborates whenever the
        // notebook's document changes. The fetcher runs synchronously on
        // creation, so `validated` is assigned before the first await below.
        let validated!: Promise<ModelValidationResult>;
        let disposeRoot!: () => void;
        const model = createRoot((dispose) => {
            disposeRoot = dispose;
            const [validation] = createResource(
                () => notebook.cells(),
                () => (validated = notebook.validate()),
            );
            return (): DblModel | undefined => {
                const result = validation();
                return result && result.tag !== "Illformed" ? result.model : undefined;
            };
        });
        const [text, setText] = createSignal("");

        // Selecting an id only edits the morphism cell (an object generator's id
        // is its cell's id); the reactive resource above re-validates into a
        // fresh elaborated model.
        const onSelect = (id: QualifiedName) => {
            const cell = notebook.get(AttrType, id);
            if (cell) {
                attr.update({ to: cell });
            }
        };

        const codomain = () => {
            const m = model();
            const cod = m?.morPresentation(attr.id)?.cod;
            return cod?.tag === "Basic" ? m?.obGeneratorLabel(cod.content)?.join(".") : "?";
        };

        expect((await validated).tag).not.toBe("Illformed");

        const container = document.createElement("div");
        document.body.appendChild(container);
        const dispose = render(
            () => (
                <Show when={model()}>
                    {(model) => (
                        <Completions
                            model={model()}
                            obType={AttrType.obType}
                            text={text()}
                            onSelect={onSelect}
                        />
                    )}
                </Show>
            ),
            container,
        );

        // Empty text: every `AttrType` generator, in generator order.
        expect(container.innerHTML).toBe(
            '<ul class="completion-list"><li>String</li><li>Integer</li><li>Boolean</li></ul>',
        );
        expect(codomain()).toBe("String");

        // "in" keeps the substring matches `String` and `Integer` (in
        // generator order); `Boolean` drops out.
        setText("in");
        expect(container.innerHTML).toBe(
            '<ul class="completion-list"><li>String</li><li>Integer</li></ul>',
        );

        // Selecting `Integer` edits the document and re-validates.
        const integer = [...container.querySelectorAll("li")].find(
            (li) => li.textContent === "Integer",
        )!;
        integer.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        await validated;
        expect(codomain()).toBe("Integer");

        dispose();
        disposeRoot();
        container.remove();
    });
});
