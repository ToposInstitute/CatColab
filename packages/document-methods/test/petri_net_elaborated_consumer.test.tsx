/*
 * A fourth Petri-net scenario, companion to `petri_net_editor_comparison`.
 *
 * The comparison file renders three editors that all read the notebook's *cell
 * handles* directly. This file instead renders a consumer that reads the
 * *elaborated model* — the `DblModel` produced by `Notebook.validate()` — the
 * way the frontend's analyses do (`petri_net_visualization.tsx`,
 * `mass_action.tsx`, `object_list_editor.tsx`): it enumerates `obGenerators`/
 * `morGenerators`, resolves display labels with `obGeneratorLabel`/
 * `morGeneratorLabel`, and walks each transition's tensor-product `dom`/`cod`
 * with `collectProduct`. The consumer never touches the Petri-net-specific
 * `from`/`to` accessors; it works off the generic elaborated structure alone.
 *
 * Editing still goes through the document (the typed notebook), exactly as in
 * the frontend, where the elaborated model is a derived, read-only artifact:
 * the mutation button only edits a cell, and a `createResource` keyed on the
 * notebook's cells re-validates reactively to obtain a fresh elaborated model,
 * which the view re-renders.
 */
/* oxlint-disable unicorn/consistent-function-scoping */
import { createBinder, type DocumentStore, type ModelValidationResult } from "catcolab-documents";
import { Place, PetriNet, Transition } from "catcolab-logics/petri-net";
import { createResource, For, type Resource, Show } from "solid-js";
import { createStore, produce, type SetStoreFunction, unwrap } from "solid-js/store";
import { render } from "solid-js/web";
import { describe, expect, test } from "vitest";

import type { ModelDocument } from "catcolab-document-methods";
import { collectProduct, type DblModel, type Ob, type QualifiedName } from "catlog-wasm";
import { selfResolving } from "./self_resolving";

/** Test helper: wait until a resource has finished (re)loading. */
async function settled(resource: Resource<unknown>) {
    while (resource.loading) {
        await new Promise((resolve) => setTimeout(resolve));
    }
}

// Test hook: a real consumer keeps the validation resource component-local.
// `Consumer` assigns this so the test can await re-validation from outside the
// component.
let globalValidation!: Resource<ModelValidationResult>;

const EXPECTED_INITIAL =
    "<section><h1>Petri net</h1><ul>" +
    '<li><span class="cell-label">Place: A</span></li>' +
    '<li><span class="cell-label">Place: B</span></li>' +
    '<li><span class="cell-label">Place: C</span></li>' +
    '<li><span class="cell-label">Transition: <span>[A<!---->]</span><span> -&gt; </span>' +
    "<span>[C<!---->]</span><span>fires</span></span>" +
    '<button aria-label="run test mutation"></button></li></ul></section>';

const EXPECTED_AFTER_APPEND =
    "<section><h1>Petri net</h1><ul>" +
    '<li><span class="cell-label">Place: A</span></li>' +
    '<li><span class="cell-label">Place: B</span></li>' +
    '<li><span class="cell-label">Place: C</span></li>' +
    '<li><span class="cell-label">Transition: <span>[A, B<!---->]</span><span> -&gt; </span>' +
    "<span>[C<!---->]</span><span>fires</span></span>" +
    '<button aria-label="run test mutation"></button></li></ul></section>';

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
    // Resolve a notebook's own model (validation now goes through the store).
    ...selfResolving<SolidStoreHandle>([PetriNet]),
};

const solidBinder = createBinder(solidStore);

describe("Petri-net elaborated-model consumer", () => {
    test("catcolab-documents, elaborated-model consumer", async () => {
        // Resolve a place's display label from the elaborated model, exactly as
        // the frontend does (`ob.label?.join(".")`).

        function placeLabel(model: DblModel, id: QualifiedName): string {
            return model.obGeneratorLabel(id)?.join(".") ?? "?";
        }

        // Collect the place ids of a transition's input/output from the
        // elaborated morphism's tensor-product endpoint, mirroring the
        // `collectProduct(mor.dom)` usage in `petri_net_visualization.tsx`.
        function placeIds(ob: Ob): QualifiedName[] {
            return collectProduct(ob).flatMap((o) => (o.tag === "Basic" ? [o.content] : []));
        }

        function ObListView(props: { model: DblModel; ids: QualifiedName[] }) {
            return <span>[{props.ids.map((id) => placeLabel(props.model, id)).join(", ")}]</span>;
        }

        function MorphismCellView(props: {
            model: DblModel;
            id: QualifiedName;
            onMutate: () => void;
        }) {
            const mor = () => {
                const m = props.model.morPresentation(props.id);
                if (!m) {
                    throw new Error(`missing morphism presentation for ${props.id}`);
                }
                return m;
            };
            return (
                <li>
                    <span class="cell-label">
                        Transition: <ObListView model={props.model} ids={placeIds(mor().dom)} />
                        <span> -&gt; </span>
                        <ObListView model={props.model} ids={placeIds(mor().cod)} />
                        <span>{props.model.morGeneratorLabel(props.id)?.join(".")}</span>
                    </span>
                    <button aria-label="run test mutation" onClick={props.onMutate} />
                </li>
            );
        }

        function ElaboratedModelView(props: {
            name: string;
            model: DblModel;
            onMutate: () => void;
        }) {
            return (
                <section>
                    <h1>{props.name}</h1>
                    <ul>
                        <For each={props.model.obGenerators()}>
                            {(id) => (
                                <li>
                                    <span class="cell-label">
                                        Place: {placeLabel(props.model, id)}
                                    </span>
                                </li>
                            )}
                        </For>
                        <For each={props.model.morGenerators()}>
                            {(id) => (
                                <MorphismCellView
                                    model={props.model}
                                    id={id}
                                    onMutate={props.onMutate}
                                />
                            )}
                        </For>
                    </ul>
                </section>
            );
        }

        // Build and edit the notebook through the typed document API, just as
        // the frontend does; the elaborated model below is derived from it.
        const notebook = solidBinder.createNotebook(PetriNet, { name: "Petri net" });
        const a = notebook.add(Place, { name: "A" });
        notebook.add(Place, { name: "B" });
        const c = notebook.add(Place, { name: "C" });
        notebook.add(Transition, { name: "fires", from: [a], to: [c] });

        // The consumer component owns the reactive validation: a resource keyed
        // on the notebook's cells re-elaborates on every edit, and the view
        // re-renders from the fresh elaborated model. Re-elaboration is async (a
        // notebook may resolve instantiations through the store).
        function Consumer() {
            const [validation] = createResource(
                () => notebook.cells(),
                () => notebook.validate(),
            );
            const model = (): DblModel | undefined => {
                const result = validation();
                return result && result.tag !== "Illformed" ? result.model : undefined;
            };

            // Test hook only: expose the resource so the test can await
            // re-validation from outside the component.
            globalValidation = validation;

            // The button only edits the document; the reactive resource above
            // re-validates on its own, yielding a fresh elaborated model that
            // the view re-renders.
            const runTestMutation = () => {
                const m = model();
                if (!m) {
                    return;
                }
                // Generically find a place not yet wired into any transition,
                // reading only the elaborated structure.
                const referenced = new Set<QualifiedName>();
                for (const morId of m.morGenerators()) {
                    const mor = m.morPresentation(morId);
                    if (!mor) {
                        continue;
                    }
                    for (const id of [...placeIds(mor.dom), ...placeIds(mor.cod)]) {
                        referenced.add(id);
                    }
                }
                const inputId = m.obGenerators().find((id) => !referenced.has(id));
                if (!inputId) {
                    return;
                }
                // An object generator's id is its object cell's id, so the
                // generic choice maps straight back to a document cell to edit.
                const place = notebook.cellsOf(Place).find((p) => p.id === inputId);
                const transition = notebook.cellsOf(Transition).at(0);
                if (!place || !transition) {
                    return;
                }
                transition.update({ from: [...transition.from, place] });
            };

            return (
                <Show when={model()}>
                    {(model) => (
                        <ElaboratedModelView
                            name={notebook.name}
                            model={model()}
                            onMutate={runTestMutation}
                        />
                    )}
                </Show>
            );
        }

        const container = document.createElement("div");
        document.body.appendChild(container);
        const dispose = render(() => <Consumer />, container);

        await settled(globalValidation);
        expect(globalValidation()?.tag).toBe("Valid");
        expect(container.innerHTML).toBe(EXPECTED_INITIAL);

        const appendButton = container.querySelector<HTMLButtonElement>(
            '[aria-label="run test mutation"]',
        )!;
        appendButton.click();
        await settled(globalValidation);
        expect(container.innerHTML).toBe(EXPECTED_AFTER_APPEND);

        dispose();
        container.remove();
    });
});
