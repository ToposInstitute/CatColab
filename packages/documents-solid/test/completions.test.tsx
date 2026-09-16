import { Attr, AttrType, Entity, SimpleSchema } from "catcolab-logics/simple-schema";
import { type Accessor, createSignal, For } from "solid-js";
import { render } from "solid-js/web";
import { describe, expect, test } from "vitest";

import {
    createBinder,
    createInMemoryStore,
    type MorphismCell,
    type Notebook,
} from "catcolab-documents";
import { createNotebookValidation, createSolidDocumentStore } from "../src";

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

describe("Solid completions from validation", { timeout: 20_000 }, () => {
    test("feeds validated judgments to a component", async () => {
        const store = createSolidDocumentStore(createInMemoryStore());
        const notebook = await createBinder(store).createNotebook(SimpleSchema, {
            title: "Company schema",
        });
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
            [...container.querySelectorAll(".completion-list li")].map((item) => item.textContent);
        const selectedLabel = () => container.querySelector(".selected")?.textContent;

        await expect
            .poll(completionLabels, { timeout: 20_000 })
            .toEqual(["String", "Integer", "Boolean"]);
        setText("in");
        expect(completionLabels()).toEqual(["String", "Integer"]);

        container.querySelectorAll<HTMLElement>(".completion-list li")[1]?.click();
        await expect.poll(selectedLabel).toBe("Integer");

        dispose();
        container.remove();
        store.dispose();
    });
});
