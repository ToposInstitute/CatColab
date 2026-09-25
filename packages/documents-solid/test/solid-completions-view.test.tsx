import { Attr, AttrType, Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { type Accessor, createSignal, For } from "solid-js";
import { render } from "solid-js/web";
import { describe, expect, test } from "vitest";

// Validation accessors feed completions to a Solid component.
import {
    createBinder,
    createInMemoryStore,
    type MorphismCell,
    type Notebook,
} from "catcolab-documents";
import { createNotebookValidation, createSolidDocumentStore } from "../src";

/** Shows an attribute's codomain and offers completions for replacing it,
drawn from the validated model's attribute types. */
function CodomainPicker(props: {
    attrCell: MorphismCell<typeof SimpleSchema, typeof Attr>;
    notebook: Notebook<typeof SimpleSchema>;
    text: Accessor<string>;
    onSelect: (label: string) => void;
}) {
    const validation = createNotebookValidation(props.notebook);

    const completions = () =>
        validation()
            ?.model.judgmentsOf(AttrType)
            .map((judgment) => judgment.label.join("."))
            .filter((label) => label.toLowerCase().includes(props.text().toLowerCase())) ?? [];

    return (
        <span>
            <span class="selected">{props.attrCell.to?.label ?? "?"}</span>
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
        const store = createSolidDocumentStore(createInMemoryStore());
        const binder = createBinder(store);
        const notebook = await binder.createNotebook(SimpleSchema, { title: "Company schema" });

        const person = notebook.add(Entity, { label: "Person" });
        const string = notebook.add(AttrType, { label: "String" });
        const integer = notebook.add(AttrType, { label: "Integer" });
        const boolean = notebook.add(AttrType, { label: "Boolean" });
        const name = notebook.add(Attr, { label: "name", from: person, to: string });
        const attrTypes = [string, integer, boolean];

        const [text, setText] = createSignal("");
        const container = document.createElement("div");
        document.body.appendChild(container);
        const dispose = render(
            () => (
                <CodomainPicker
                    attrCell={name}
                    notebook={notebook}
                    text={text}
                    onSelect={(label) => {
                        const cell = attrTypes.find((attrType) => attrType.label === label);
                        if (cell) {
                            name.update({ to: cell });
                        }
                    }}
                />
            ),
            container,
        );

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

        dispose();
        container.remove();
        store.dispose();
    });
});
