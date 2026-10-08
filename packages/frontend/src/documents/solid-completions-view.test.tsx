// @vitest-environment happy-dom
import { Attr, AttrType, Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { type Accessor, createSignal, For } from "solid-js";
import { render } from "solid-js/web";
import { describe, expect, test } from "vitest";

// Validation accessors feed completions to a Solid component.
import {
    createBinder,
    type MorphismCell,
    type ObjectCell,
    type Notebook,
} from "catcolab-documents";
import { createAutomergeNotebookView, type NotebookView } from "./notebook_view";
import { createProjectedStore } from "./projected-store";
import { createNotebookValidation } from "./validation";

/** Shows an attribute's codomain and offers completions for replacing it,
drawn from the validated model's attribute types. */
function CodomainPicker(props: {
    attrCell: MorphismCell<typeof SimpleSchema, typeof Attr>;
    notebook: Notebook<typeof SimpleSchema>;
    view: NotebookView<typeof SimpleSchema, unknown, unknown>;
    text: Accessor<string>;
    onSelect: (label: string) => void;
}) {
    // oxlint-disable-next-line solid/reactivity -- The picker is keyed on the notebook.
    const validation = createNotebookValidation(props.notebook);
    const attr = () =>
        props.view.cell(props.attrCell.id) as MorphismCell<typeof SimpleSchema, typeof Attr>;
    const selectedLabel = () => attr().to?.label ?? "?";

    const completions = () =>
        validation()
            ?.model.judgmentsOf(AttrType)
            .map((judgment) => judgment.label.join("."))
            .filter((label) => label.toLowerCase().includes(props.text().toLowerCase())) ?? [];

    return (
        <span>
            <span class="selected">{selectedLabel()}</span>
            <input
                class="target-label"
                value={attr().to?.label ?? ""}
                onInput={(event) => attr().to?.update({ label: event.currentTarget.value })}
            />
            <ul class="completion-list">
                <For each={completions()}>
                    {(label) => <li onClick={() => props.onSelect(label)}>{label}</li>}
                </For>
            </ul>
        </span>
    );
}

describe("SolidJS completions from a validation view", { timeout: 20000 }, () => {
    test("the validated model feeds completions and codomain selection", async () => {
        const store = createProjectedStore();
        const binder = createBinder(store);
        const notebook = await binder.createNotebook(SimpleSchema, { title: "Company schema" });

        const person = notebook.add(Entity, { label: "Person" });
        const string = notebook.add(AttrType, { label: "String" });
        notebook.add(AttrType, { label: "Integer" });
        notebook.add(AttrType, { label: "Boolean" });
        const name = notebook.add(Attr, { label: "name", from: person, to: string });
        // Core cells are commands; the mounted editor reads through the frontend view.

        const [text, setText] = createSignal("");
        const container = document.createElement("div");
        document.body.appendChild(container);
        const dispose = render(() => {
            const view = createAutomergeNotebookView(
                () => notebook,
                (bound) => bound.handle.docHandle,
            );
            return (
                <CodomainPicker
                    attrCell={name}
                    notebook={notebook}
                    view={view()}
                    text={text}
                    onSelect={(label) => {
                        const cell = view()
                            .cellsOf(AttrType)
                            .find((cell) => "label" in cell && cell.label === label);
                        if (cell?.kind === "object") {
                            (
                                view().cell(name.id) as MorphismCell<
                                    typeof SimpleSchema,
                                    typeof Attr
                                >
                            ).update({ to: cell as ObjectCell<typeof AttrType> });
                        }
                    }}
                />
            );
        }, container);

        const completionLabels = () =>
            [...container.querySelectorAll(".completion-list li")].map((li) => li.textContent);
        const selectedLabel = () => container.querySelector(".selected")?.textContent;

        // Completions appear once the view's first validation completes.
        await expect
            .poll(completionLabels, { timeout: 20000 })
            .toEqual(["String", "Integer", "Boolean"]);
        expect(selectedLabel()).toBe("String");

        // Filtering is synchronous: it only reads the already-validated model.
        setText("in");
        expect(completionLabels()).toEqual(["String", "Integer"]);

        // Selecting a completion updates the document; the codomain re-renders
        // and the view revalidates without issues.
        const items = container.querySelectorAll<HTMLElement>(".completion-list li");
        items[1]?.click();
        await expect.poll(selectedLabel).toBe("Integer");

        // Edit an object label through its stable view wrapper; endpoint readers
        // update synchronously while completions wait for the next validation.
        const input = container.querySelector<HTMLInputElement>(".target-label")!;
        input.value = "Whole number";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        expect(selectedLabel()).toBe("Whole number");
        expect(name.to?.label).toBe("Whole number");
        setText("");
        await expect.poll(completionLabels).toEqual(["String", "Whole number", "Boolean"]);

        dispose();
        notebook.dispose();
        container.remove();
    });
});
