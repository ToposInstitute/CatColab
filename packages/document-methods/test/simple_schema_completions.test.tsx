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
 *   4. Selecting one edits the typed notebook; a `createResource` driven by
 *      `Notebook.onChangeFormalContent` re-validates reactively into a fresh
 *      elaborated model.
 */
/* oxlint-disable unicorn/consistent-function-scoping */
import { createBinder, type DocumentStore, type ModelValidationResult } from "catcolab-documents";
import { Attr, AttrType, Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { createResource, createSignal, For, type Resource, Show } from "solid-js";
import { createStore, produce, type SetStoreFunction, unwrap } from "solid-js/store";
import { render } from "solid-js/web";
import { describe, expect, test } from "vitest";

import type { ModelDocument } from "catcolab-document-methods";
import type { DblModel, ObType, QualifiedName } from "catlog-wasm";
import { selfResolving } from "./self_resolving";

/** Test helper: wait until a resource has finished (re)loading. */
async function settled(resource: Resource<unknown>) {
    while (resource.loading) {
        await new Promise((resolve) => setTimeout(resolve));
    }
}

// Test hooks: a real consumer keeps the validation resource and the derived
// model accessor component-local. `Consumer` assigns these so the test can
// await re-validation (`globalValidation`) and read the elaborated model
// (`globalModel`) from outside the component.
let globalValidation!: Resource<ModelValidationResult>;
let globalModel!: () => DblModel | undefined;

type SolidStoreHandle = {
    doc: ModelDocument;
    setDoc: SetStoreFunction<ModelDocument>;
    listeners: Set<() => void>;
};

const solidStore: DocumentStore<SolidStoreHandle> = {
    createHandle(initialDoc) {
        const [doc, setDoc] = createStore<ModelDocument>(initialDoc as ModelDocument);
        return { doc, setDoc, listeners: new Set() };
    },
    viewDocument: (handle) => handle.doc,
    changeDocument: (handle, fn) => {
        handle.setDoc(produce<ModelDocument>(fn));
        for (const listener of Array.from(handle.listeners)) {
            listener();
        }
    },
    subscribe: (handle, callback) => {
        handle.listeners.add(callback);
        return () => {
            handle.listeners.delete(callback);
        };
    },
    copyValue: (_handle, value) => structuredClone(unwrap(value)),
    // Resolve a notebook's own model (validation now goes through the store).
    ...selfResolving<SolidStoreHandle>(),
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

        // The typed text is test-driven UI state, lifted so the test can
        // simulate typing; the consumer component below reads it as a prop.
        const [text, setText] = createSignal("");

        // The consumer component owns the reactive validation: a resource
        // driven by `onChangeFormalContent` re-elaborates when the formal cells
        // change, and the derived `model` accessor exposes its elaborated
        // `DblModel`.
        function Consumer(props: { text: string }) {
            // `onChangeFormalContent` fires only when the formal cells change,
            // so it can bump a signal the resource source reads directly: the
            // resource re-elaborates on a formal-cell edit but not, say, a
            // rich-text comment.
            const [revision, setRevision] = createSignal(0);
            notebook.onChangeFormalContent(() => setRevision((n) => n + 1));
            const [validation] = createResource(
                () => revision(),
                () => notebook.validate(),
            );
            const model = (): DblModel | undefined => {
                const result = validation();
                return result && result.issues === undefined ? result.value : undefined;
            };

            // Selecting an id only edits the morphism cell (an object
            // generator's id is its cell's id); the reactive resource above
            // re-validates into a fresh elaborated model.
            const onSelect = (id: QualifiedName) => {
                const result = notebook.get(AttrType, id);
                if (!result.issues) {
                    attr.update({ to: result.value });
                }
            };

            // Test hooks only: expose the resource and model so the test can
            // await re-validation and inspect the codomain from outside.
            globalValidation = validation;
            globalModel = model;

            return (
                <Show when={model()}>
                    {(model) => (
                        <Completions
                            model={model()}
                            obType={AttrType.obType}
                            text={props.text}
                            onSelect={onSelect}
                        />
                    )}
                </Show>
            );
        }

        const container = document.createElement("div");
        document.body.appendChild(container);
        const dispose = render(() => <Consumer text={text()} />, container);

        function codomain() {
            const m = globalModel();
            const cod = m?.morPresentation(attr.id)?.cod;
            return cod?.tag === "Basic" ? m?.obGeneratorLabel(cod.content)?.join(".") : "?";
        }

        await settled(globalValidation);
        expect(globalValidation()?.issues).toBeUndefined();

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
        await settled(globalValidation);
        expect(codomain()).toBe("Integer");

        dispose();
        container.remove();
    });
});
