import Book from "lucide-solid/icons/book";
import FileText from "lucide-solid/icons/file-text";
import PieChart from "lucide-solid/icons/pie-chart";
import Table from "lucide-solid/icons/table";
import { createSignal, For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { Button } from "./button";
import type { Completion } from "./completions";
import { TextInput } from "./text_input";

const meta = {
    title: "Forms & Inputs/TextInput",
    component: TextInput,
} satisfies Meta<typeof TextInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Summary: Story = {
    render: () => {
        const [text, setText] = createSignal("");

        return (
            <div style={{ padding: "16px" }}>
                <TextInput text={text()} setText={setText} placeholder="Type here..." />
            </div>
        );
    },
    tags: ["!autodocs", "!dev"],
};

export const Basic: Story = {
    render: () => {
        const [text, setText] = createSignal("");

        return <TextInput text={text()} setText={setText} placeholder="Type here..." />;
    },
};

export const WithInitialValue: Story = {
    render: () => {
        const [text, setText] = createSignal("Hello, world!");

        return <TextInput text={text()} setText={setText} />;
    },
};

export const WithCompletions: Story = {
    render: () => {
        const [text, setText] = createSignal("");

        const completions: Completion[] = [
            { name: "Text", description: "Start writing text", icon: <FileText size={16} /> },
            { name: "Model", description: "Create a new model", icon: <Book size={16} /> },
            { name: "Diagram", description: "Create a diagram", icon: <PieChart size={16} /> },
            { name: "Table", description: "Insert a table", icon: <Table size={16} /> },
        ];

        return (
            <div style={{ padding: "16px" }}>
                <p>Type to see completions (use arrow keys to navigate, Enter to select):</p>
                <TextInput
                    text={text()}
                    setText={setText}
                    placeholder="Select cell type"
                    completions={completions}
                />
            </div>
        );
    },
};

export const WithCompletionsOnFocus: Story = {
    render: () => {
        const [text, setText] = createSignal("");

        const completions: Completion[] = [
            { name: "Text", description: "Start writing text", icon: <FileText size={16} /> },
            { name: "Model", description: "Create a new model", icon: <Book size={16} /> },
            { name: "Diagram", description: "Create a diagram", icon: <PieChart size={16} /> },
            { name: "Table", description: "Insert a table", icon: <Table size={16} /> },
        ];

        return (
            <div style={{ padding: "16px" }}>
                <p>Click input to show completions immediately:</p>
                <TextInput
                    text={text()}
                    setText={setText}
                    placeholder="Click to see options"
                    completions={completions}
                    showCompletionsOnFocus
                />
            </div>
        );
    },
};

export const WithNavigationCallbacks: Story = {
    render: () => {
        const [text, setText] = createSignal("");
        const [events, setEvents] = createSignal<string[]>([]);

        const addEvent = (event: string) => {
            setEvents((prev) => [...prev.slice(-4), event]);
        };

        return (
            <div style={{ padding: "16px" }}>
                <p>Try keyboard navigation (arrows, backspace, delete, tab, enter):</p>
                <TextInput
                    text={text()}
                    setText={setText}
                    placeholder="Type here..."
                    createBelow={() => addEvent("Create below (Enter)")}
                    deleteBackward={() => addEvent("Delete backward (Backspace when empty)")}
                    deleteForward={() => addEvent("Delete forward (Delete when empty)")}
                    exitBackward={() => addEvent("Exit backward (Shift+Tab)")}
                    exitForward={() => addEvent("Exit forward (Tab)")}
                    exitUp={() => addEvent("Exit up (ArrowUp)")}
                    exitDown={() => addEvent("Exit down (ArrowDown)")}
                    exitLeft={() => addEvent("Exit left (ArrowLeft at start)")}
                    exitRight={() => addEvent("Exit right (ArrowRight at end)")}
                    hasFocused={() => addEvent("Focused")}
                />
                <div style={{ "margin-top": "16px" }}>
                    <strong>Events:</strong>
                    <ul>
                        <For each={events()}>{(event) => <li>{event}</li>}</For>
                    </ul>
                </div>
            </div>
        );
    },
};

export const WithActiveState: Story = {
    render: () => {
        const [text, setText] = createSignal("Click button to activate");
        const [isActive, setIsActive] = createSignal(false);

        return (
            <div style={{ padding: "16px" }}>
                <p>Active state controls focus programmatically:</p>
                <TextInput
                    text={text()}
                    setText={setText}
                    isActive={isActive()}
                    hasFocused={() => setIsActive(true)}
                />
                <Button
                    type="button"
                    onClick={() => setIsActive(!isActive())}
                    style={{ "margin-top": "8px" }}
                >
                    {isActive() ? "Deactivate" : "Activate"} Input
                </Button>
            </div>
        );
    },
};

export const WithAutofill: Story = {
    render: () => {
        const [text, setText] = createSignal("");
        const [autofillTriggered, setAutofillTriggered] = createSignal(false);

        return (
            <div style={{ padding: "16px" }}>
                <p>Press Ctrl+Space to trigger autofill:</p>
                <TextInput
                    text={text()}
                    setText={setText}
                    placeholder="Try Ctrl+Space..."
                    autofill={() => {
                        setText("Auto-filled content");
                        setAutofillTriggered(true);
                        setTimeout(() => setAutofillTriggered(false), 2000);
                    }}
                />
                {autofillTriggered() && <p style={{ color: "green" }}>Autofill triggered!</p>}
            </div>
        );
    },
};

export const WithInterceptKeyDown: Story = {
    render: () => {
        const [text, setText] = createSignal("");
        const [interceptedKey, setInterceptedKey] = createSignal<string | null>(null);

        return (
            <div style={{ padding: "16px" }}>
                <p>Escape key is intercepted:</p>
                <TextInput
                    text={text()}
                    setText={setText}
                    placeholder="Press Escape..."
                    interceptKeyDown={(evt) => {
                        if (evt.key === "Escape") {
                            setInterceptedKey("Escape");
                            setTimeout(() => setInterceptedKey(null), 2000);
                            return true;
                        }
                        return false;
                    }}
                />
                {interceptedKey() && (
                    <p style={{ color: "blue" }}>Intercepted: {interceptedKey()}</p>
                )}
            </div>
        );
    },
};

export const MultipleInputsWithNavigation: Story = {
    render: () => {
        const [text1, setText1] = createSignal("First input");
        const [text2, setText2] = createSignal("Second input");
        const [text3, setText3] = createSignal("Third input");
        const [activeIndex, setActiveIndex] = createSignal(0);

        return (
            <div style={{ padding: "16px" }}>
                <p>Navigate between inputs with Tab/Shift+Tab or arrows:</p>
                <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
                    <TextInput
                        text={text1()}
                        setText={setText1}
                        placeholder="First"
                        isActive={activeIndex() === 0}
                        exitDown={() => setActiveIndex(1)}
                        exitForward={() => setActiveIndex(1)}
                        hasFocused={() => setActiveIndex(0)}
                    />
                    <TextInput
                        text={text2()}
                        setText={setText2}
                        placeholder="Second"
                        isActive={activeIndex() === 1}
                        exitUp={() => setActiveIndex(0)}
                        exitDown={() => setActiveIndex(2)}
                        exitBackward={() => setActiveIndex(0)}
                        exitForward={() => setActiveIndex(2)}
                        hasFocused={() => setActiveIndex(1)}
                    />
                    <TextInput
                        text={text3()}
                        setText={setText3}
                        placeholder="Third"
                        isActive={activeIndex() === 2}
                        exitUp={() => setActiveIndex(1)}
                        exitBackward={() => setActiveIndex(1)}
                        hasFocused={() => setActiveIndex(2)}
                    />
                </div>
                <p style={{ "margin-top": "8px" }}>Active: Input {activeIndex() + 1}</p>
            </div>
        );
    },
};

export const HorizontalInputRow: Story = {
    render: () => {
        const [texts, setTexts] = createSignal(["", "", ""]);
        const [activeIndex, setActiveIndex] = createSignal(0);

        const setText = (index: number, value: string) => {
            setTexts((prev) => {
                const newTexts = [...prev];
                newTexts[index] = value;
                return newTexts;
            });
        };

        return (
            <div style={{ padding: "16px" }}>
                <p>Navigate horizontally with arrow keys:</p>
                <div style={{ display: "flex", gap: "8px" }}>
                    <TextInput
                        text={texts()[0]}
                        setText={(v) => setText(0, v)}
                        placeholder="Left"
                        isActive={activeIndex() === 0}
                        exitRight={() => setActiveIndex(1)}
                        exitForward={() => setActiveIndex(1)}
                        hasFocused={() => setActiveIndex(0)}
                        style={{ width: "100px" }}
                    />
                    <TextInput
                        text={texts()[1]}
                        setText={(v) => setText(1, v)}
                        placeholder="Middle"
                        isActive={activeIndex() === 1}
                        exitLeft={() => setActiveIndex(0)}
                        exitRight={() => setActiveIndex(2)}
                        exitBackward={() => setActiveIndex(0)}
                        exitForward={() => setActiveIndex(2)}
                        hasFocused={() => setActiveIndex(1)}
                        style={{ width: "100px" }}
                    />
                    <TextInput
                        text={texts()[2]}
                        setText={(v) => setText(2, v)}
                        placeholder="Right"
                        isActive={activeIndex() === 2}
                        exitLeft={() => setActiveIndex(1)}
                        exitBackward={() => setActiveIndex(1)}
                        hasFocused={() => setActiveIndex(2)}
                        style={{ width: "100px" }}
                    />
                </div>
            </div>
        );
    },
};

export const WithDeletionCallbacks: Story = {
    render: () => {
        const [items, setItems] = createSignal(["Item 1", "Item 2", "Item 3"]);
        const [activeIndex, setActiveIndex] = createSignal(0);

        const deleteAt = (index: number, direction: "backward" | "forward") => {
            setItems((prev) => {
                if (prev.length <= 1) {
                    return prev;
                }
                const newItems = prev.filter((_, i) => i !== index);
                const newIndex =
                    direction === "backward"
                        ? Math.max(0, index - 1)
                        : Math.min(newItems.length - 1, index);
                setActiveIndex(newIndex);
                return newItems;
            });
        };

        return (
            <div style={{ padding: "16px" }}>
                <p>Clear an input and press Backspace/Delete to remove it:</p>
                <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
                    <For each={items()}>
                        {(item, index) => (
                            <TextInput
                                text={item}
                                setText={(v) =>
                                    setItems((prev) => {
                                        const newItems = [...prev];
                                        newItems[index()] = v;
                                        return newItems;
                                    })
                                }
                                isActive={activeIndex() === index()}
                                hasFocused={() => setActiveIndex(index())}
                                deleteBackward={() => deleteAt(index(), "backward")}
                                deleteForward={() => deleteAt(index(), "forward")}
                                exitUp={() => setActiveIndex(Math.max(0, index() - 1))}
                                exitDown={() => {
                                    setActiveIndex(Math.min(items().length - 1, index() + 1));
                                }}
                            />
                        )}
                    </For>
                </div>
                <p style={{ "margin-top": "8px" }}>Total items: {items().length}</p>
            </div>
        );
    },
};

export const WithCreateBelow: Story = {
    render: () => {
        const [items, setItems] = createSignal(["First item"]);
        const [activeIndex, setActiveIndex] = createSignal(0);

        const createBelow = (index: number) => {
            setItems((prev) => {
                const newItems = [...prev];
                newItems.splice(index + 1, 0, "");
                return newItems;
            });
            setActiveIndex(index + 1);
        };

        return (
            <div style={{ padding: "16px" }}>
                <p>Press Enter to create a new input below:</p>
                <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
                    <For each={items()}>
                        {(item, index) => (
                            <TextInput
                                text={item}
                                setText={(v) =>
                                    setItems((prev) => {
                                        const newItems = [...prev];
                                        newItems[index()] = v;
                                        return newItems;
                                    })
                                }
                                isActive={activeIndex() === index()}
                                hasFocused={() => setActiveIndex(index())}
                                createBelow={() => createBelow(index())}
                                exitUp={() => setActiveIndex(Math.max(0, index() - 1))}
                                exitDown={() => {
                                    setActiveIndex(Math.min(items().length - 1, index() + 1));
                                }}
                            />
                        )}
                    </For>
                </div>
                <p style={{ "margin-top": "8px" }}>Total items: {items().length}</p>
            </div>
        );
    },
};
