import { createSignal, For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { Button } from "./button";
import { NameInput } from "./name_input";

const meta = {
    title: "NameInput",
    component: NameInput,
} satisfies Meta<typeof NameInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Summary: Story = {
    render: () => {
        const [name, setName] = createSignal("Object A");

        return (
            <div style={{ padding: "16px" }}>
                <NameInput name={name()} setName={setName} placeholder="Unnamed" />
            </div>
        );
    },
    tags: ["!autodocs", "!dev"],
};

export const Basic: Story = {
    render: () => {
        const [name, setName] = createSignal("");

        return <NameInput name={name()} setName={setName} placeholder="Unnamed" />;
    },
};

export const WithExistingName: Story = {
    render: () => {
        const [name, setName] = createSignal("Object A");

        return (
            <div style={{ padding: "16px" }}>
                <p>Current name: {name()}</p>
                <NameInput name={name()} setName={setName} placeholder="Unnamed" />
            </div>
        );
    },
};

export const RejectsNumericInput: Story = {
    render: () => {
        const [name, setName] = createSignal("Object 1");
        const [rejectedInputs, setRejectedInputs] = createSignal<string[]>([]);

        const handleSetName = (newName: string) => {
            if (/^\d+$/.test(newName) && newName !== name()) {
                setRejectedInputs((prev) => [...prev.slice(-2), newName]);
            }
            setName(newName);
        };

        return (
            <div style={{ padding: "16px" }}>
                <p>Try entering purely numeric values (e.g., "123"):</p>
                <NameInput name={name()} setName={handleSetName} placeholder="Unnamed" />
                <div style={{ "margin-top": "8px" }}>
                    <p>Current name: {name()}</p>
                    {rejectedInputs().length > 0 && (
                        <div style={{ color: "red" }}>
                            <strong>Rejected numeric inputs:</strong>
                            <ul>
                                <For each={rejectedInputs()}>{(input) => <li>{input}</li>}</For>
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        );
    },
};

export const WithActiveState: Story = {
    render: () => {
        const [name, setName] = createSignal("Click to activate");
        const [isActive, setIsActive] = createSignal(false);

        return (
            <div style={{ padding: "16px" }}>
                <NameInput
                    name={name()}
                    setName={setName}
                    placeholder="Unnamed"
                    isActive={isActive()}
                    hasFocused={() => setIsActive(true)}
                />
                <Button
                    type="button"
                    onClick={() => setIsActive(!isActive())}
                    style={{ "margin-top": "8px" }}
                >
                    {isActive() ? "Deactivate" : "Activate"}
                </Button>
            </div>
        );
    },
};

export const WithNavigation: Story = {
    render: () => {
        const [name, setName] = createSignal("Object A");
        const [events, setEvents] = createSignal<string[]>([]);

        const addEvent = (event: string) => {
            setEvents((prev) => [...prev.slice(-4), event]);
        };

        return (
            <div style={{ padding: "16px" }}>
                <p>Try keyboard navigation:</p>
                <NameInput
                    name={name()}
                    setName={setName}
                    placeholder="Unnamed"
                    deleteBackward={() => addEvent("Delete backward")}
                    deleteForward={() => addEvent("Delete forward")}
                    exitBackward={() => addEvent("Exit backward")}
                    exitForward={() => addEvent("Exit forward")}
                    exitUp={() => addEvent("Exit up")}
                    exitDown={() => addEvent("Exit down")}
                    exitLeft={() => addEvent("Exit left")}
                    exitRight={() => addEvent("Exit right")}
                />
                <div style={{ "margin-top": "16px" }}>
                    <strong>Navigation events:</strong>
                    <ul>
                        <For each={events()}>{(event) => <li>{event}</li>}</For>
                    </ul>
                </div>
            </div>
        );
    },
};

export const MultipleObjectsEditor: Story = {
    render: () => {
        const [objects, setObjects] = createSignal([
            { id: 1, name: "Object A" },
            { id: 2, name: "Object B" },
            { id: 3, name: "Object C" },
        ]);
        const [activeId, setActiveId] = createSignal<number | null>(null);

        const updateName = (id: number, name: string) => {
            setObjects((prev) => prev.map((obj) => (obj.id === id ? { ...obj, name } : obj)));
        };

        const getNextId = (currentId: number) => {
            const index = objects().findIndex((obj) => obj.id === currentId);
            return objects()[index + 1]?.id ?? null;
        };

        const getPrevId = (currentId: number) => {
            const index = objects().findIndex((obj) => obj.id === currentId);
            return objects()[index - 1]?.id ?? null;
        };

        return (
            <div style={{ padding: "16px" }}>
                <p>Navigate between inputs with arrows or Tab:</p>
                <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
                    <For each={objects()}>
                        {(obj) => (
                            <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
                                <span style={{ "min-width": "80px" }}>Object {obj.id}:</span>
                                <NameInput
                                    name={obj.name}
                                    setName={(name) => updateName(obj.id, name)}
                                    placeholder="Unnamed"
                                    isActive={activeId() === obj.id}
                                    exitUp={() => setActiveId(getPrevId(obj.id))}
                                    exitDown={() => setActiveId(getNextId(obj.id))}
                                    exitBackward={() => setActiveId(getPrevId(obj.id))}
                                    exitForward={() => setActiveId(getNextId(obj.id))}
                                    hasFocused={() => setActiveId(obj.id)}
                                />
                            </div>
                        )}
                    </For>
                </div>
            </div>
        );
    },
};

export const WithoutPlaceholder: Story = {
    render: () => {
        const [name, setName] = createSignal("");

        return (
            <div style={{ padding: "16px" }}>
                <p>No placeholder (empty string shows as invalid):</p>
                <NameInput name={name()} setName={setName} />
            </div>
        );
    },
};
