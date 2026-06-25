/*
 * A simple-schema scenario focused on *completions*, companion to
 * `petri_net_elaborated_consumer`.
 *
 * Like that file, this consumer reads the *elaborated model* — the `DblModel`
 * produced by `Notebook.validate()` — rather than the notebook's cell handles.
 * Here it reproduces how the frontend computes autocompletions when editing a
 * morphism's endpoint (`model/object_input.tsx`'s `BasicObInput` ->
 * `components/id_input.tsx`'s `IdInput` -> `ui-components/completions.tsx`):
 *
 *   1. The candidate ids come from `obGeneratorsWithType(obType)`, filtered to
 *      the endpoint's object type (`AttrType` for an `Attr`'s codomain).
 *   2. Each id becomes a `Completion` whose display name is the elaborated label
 *      `obGeneratorLabel(id)?.join(".")` and whose `onComplete` selects the id.
 *   3. Typed text narrows the list with the same prefix-then-substring ranking
 *      as `remainingCompletions` in `ui-components/completions.tsx`.
 *   4. Selecting a completion edits the document (the typed notebook), which is
 *      then re-validated to obtain a fresh, derived elaborated model.
 *
 * The consumer never reads the simple-schema-specific cell accessors; the
 * completion data is taken entirely from the generic elaborated structure.
 */
/* oxlint-disable unicorn/consistent-function-scoping */
import { createBinder, type DocumentStore } from "catcolab-documents";
import { Attr, AttrType, Entity, Mapping, SimpleSchema } from "catcolab-logics/simple-schema";
import { createSignal, For } from "solid-js";
import { createStore, produce, type SetStoreFunction, unwrap } from "solid-js/store";
import { render } from "solid-js/web";
import { describe, expect, test } from "vitest";

import type { ModelDocument } from "catcolab-document-methods";
import type { DblModel, Ob, ObType, QualifiedName } from "catlog-wasm";

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

/** A possible completion, mirroring `Completion` in `ui-components`. */
type Completion = { name: string; onComplete: () => void };

/**
 * Rank completions by the typed text exactly as `remainingCompletions` in
 * `packages/ui-components/src/completions.tsx`: prefix matches first, then
 * substring matches, with duplicates of the prefix matches removed.
 */
function rankCompletions(completions: Completion[], text: string): Completion[] {
    const prefix = text.toLowerCase();
    const starts = completions.filter((c) => c.name.toLowerCase().startsWith(prefix));
    const startsNames = new Set(starts.map((c) => c.name.toLowerCase()));
    const includes = completions.filter(
        (c) => c.name.toLowerCase().includes(prefix) && !startsNames.has(c.name.toLowerCase()),
    );
    return starts.concat(includes);
}

describe("simple-schema completions consumer", () => {
    test("catcolab-documents, elaborated-model completions", async () => {
        // Resolve an object generator's display label, exactly as the frontend
        // does (`ob.label?.join(".")`).
        function obLabel(model: DblModel, id: QualifiedName): string {
            return model.obGeneratorLabel(id)?.join(".") ?? "?";
        }

        // A `Basic` endpoint object resolves to the id of its object generator.
        function basicObId(ob: Ob): QualifiedName | null {
            return ob.tag === "Basic" ? ob.content : null;
        }

        function morPresentation(model: DblModel, id: QualifiedName) {
            const m = model.morPresentation(id);
            if (!m) {
                throw new Error(`missing morphism presentation for ${id}`);
            }
            return m;
        }

        // The endpoint editor: mirrors `BasicObInput` -> `IdInput`. It reads the
        // candidate ids from `obGeneratorsWithType`, turns each into a
        // `Completion` labelled by the elaborated model, and renders the
        // prefix-then-substring ranked list for the typed text.
        function CodomainCompletionInput(props: {
            model: DblModel;
            morId: QualifiedName;
            obType: ObType;
            onComplete: (id: QualifiedName) => void;
        }) {
            const [text, setText] = createSignal("");

            const currentCodId = () => basicObId(morPresentation(props.model, props.morId).cod);

            const completions = (): Completion[] =>
                props.model.obGeneratorsWithType(props.obType).map((id) => ({
                    name: obLabel(props.model, id),
                    onComplete: () => {
                        props.onComplete(id);
                        // Mirrors `IdInput.updateText`: the displayed text
                        // becomes the completed label.
                        setText(obLabel(props.model, id));
                    },
                }));

            const ranked = () => rankCompletions(completions(), text());

            const codLabel = () => {
                const id = currentCodId();
                return id ? obLabel(props.model, id) : "?";
            };
            return (
                <div class="id-input">
                    <span class="cod-label">{codLabel()}</span>
                    <input class="cod-input" onInput={(e) => setText(e.currentTarget.value)} />
                    <ul class="completion-list">
                        <For each={ranked()}>
                            {(c) => (
                                <li class="completion-name" onMouseDown={() => c.onComplete()}>
                                    {c.name}
                                </li>
                            )}
                        </For>
                    </ul>
                </div>
            );
        }

        function SchemaMorphismView(props: {
            name: string;
            model: DblModel;
            morId: QualifiedName;
            obType: ObType;
            onComplete: (id: QualifiedName) => void;
        }) {
            const domId = () => basicObId(morPresentation(props.model, props.morId).dom);
            const morName = () => props.model.morGeneratorLabel(props.morId)?.join(".");
            return (
                <section>
                    <h1>{props.name}</h1>
                    <div class="mor-editor">
                        <span class="mor-name">{morName()}</span>
                        <span class="dom-label">
                            {domId() ? obLabel(props.model, domId() as QualifiedName) : "?"}
                        </span>
                        <span> -&gt; </span>
                        <CodomainCompletionInput
                            model={props.model}
                            morId={props.morId}
                            obType={props.obType}
                            onComplete={props.onComplete}
                        />
                    </div>
                </section>
            );
        }

        // Build the schema through the typed document API, just as the frontend
        // does; the elaborated model below is derived from it.
        const notebook = solidBinder.createNotebook(SimpleSchema, { name: "Company schema" });
        const person = notebook.add(Entity, { name: "Person" });
        const str = notebook.add(AttrType, { name: "String" });
        notebook.add(AttrType, { name: "Integer" });
        notebook.add(AttrType, { name: "Boolean" });
        // `Mapping` exists only so the morphism type filter on completions is
        // meaningful: `obGeneratorsWithType(AttrType)` must exclude entities.
        void Mapping;
        const attr = notebook.add(Attr, { name: "name", from: person, to: str });

        const initial = await notebook.validate();
        expect(initial.tag).toBe("Valid");
        if (initial.tag === "Illformed") {
            throw new Error(initial.error);
        }

        const [model, setModel] = createSignal<DblModel>(initial.model);

        // Selecting a completion edits the document's morphism cell, then
        // re-validates to obtain a fresh elaborated model. Re-elaboration is
        // async, so the test awaits this promise before re-asserting.
        let mutationDone: Promise<void> = Promise.resolve();
        const onComplete = (id: QualifiedName) => {
            mutationDone = (async () => {
                // An object generator's id is its object cell's id, so the
                // selected id maps straight back to a document cell to edit.
                const cell = notebook.cellsOf(AttrType).find((c) => c.id === id);
                if (!cell) {
                    return;
                }
                attr.update({ to: cell });
                const next = await notebook.validate();
                if (next.tag !== "Illformed") {
                    setModel(next.model);
                }
            })();
        };

        const container = document.createElement("div");
        document.body.appendChild(container);

        const dispose = render(
            () => (
                <SchemaMorphismView
                    name={notebook.name}
                    model={model()}
                    morId={attr.id}
                    obType={AttrType.obType}
                    onComplete={onComplete}
                />
            ),
            container,
        );

        // Initially (empty text) every `AttrType` generator is offered, in
        // generator order, and the codomain is the `String` it was created with.
        expect(container.innerHTML).toBe(EXPECTED_INITIAL);

        // Typing "in" narrows the list: `Integer` ranks first (prefix match),
        // then `String` (substring match); `Boolean` drops out entirely.
        const input = container.querySelector<HTMLInputElement>(".cod-input")!;
        input.value = "in";
        input.dispatchEvent(new InputEvent("input", { bubbles: true }));
        expect(container.innerHTML).toBe(EXPECTED_AFTER_TYPING);

        // Selecting `Integer` edits the document and re-validates; the codomain
        // label reflects the new elaborated model.
        const integerOption = [
            ...container.querySelectorAll<HTMLLIElement>(".completion-name"),
        ].find((li) => li.textContent === "Integer")!;
        integerOption.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        await mutationDone;
        expect(container.innerHTML).toBe(EXPECTED_AFTER_SELECT);

        dispose();
        container.remove();
    });
});

const EXPECTED_INITIAL =
    "<section><h1>Company schema</h1>" +
    '<div class="mor-editor"><span class="mor-name">name</span>' +
    '<span class="dom-label">Person</span><span> -&gt; </span>' +
    '<div class="id-input"><span class="cod-label">String</span>' +
    '<input class="cod-input"><ul class="completion-list">' +
    '<li class="completion-name">String</li>' +
    '<li class="completion-name">Integer</li>' +
    '<li class="completion-name">Boolean</li></ul></div></div></section>';

const EXPECTED_AFTER_TYPING =
    "<section><h1>Company schema</h1>" +
    '<div class="mor-editor"><span class="mor-name">name</span>' +
    '<span class="dom-label">Person</span><span> -&gt; </span>' +
    '<div class="id-input"><span class="cod-label">String</span>' +
    '<input class="cod-input"><ul class="completion-list">' +
    '<li class="completion-name">Integer</li>' +
    '<li class="completion-name">String</li></ul></div></div></section>';

const EXPECTED_AFTER_SELECT =
    "<section><h1>Company schema</h1>" +
    '<div class="mor-editor"><span class="mor-name">name</span>' +
    '<span class="dom-label">Person</span><span> -&gt; </span>' +
    '<div class="id-input"><span class="cod-label">Integer</span>' +
    '<input class="cod-input"><ul class="completion-list">' +
    '<li class="completion-name">Integer</li></ul></div></div></section>';
