import Book from "lucide-solid/icons/book";
import FileText from "lucide-solid/icons/file-text";
import PieChart from "lucide-solid/icons/pie-chart";
import Table from "lucide-solid/icons/table";
import { createSignal, For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { Button } from "./button";
import type { Completion } from "./completions";
import { InlineInput } from "./inline_input";

const meta = {
    title: "InlineInput",
    component: InlineInput,
} satisfies Meta<typeof InlineInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Summary: Story = {
    render: () => {
        const [text, setText] = createSignal("Untitled Document");

        return (
            <div style={{ padding: "16px" }}>
                <InlineInput text={text()} setText={setText} placeholder="Enter a name..." />
            </div>
        );
    },
    tags: ["!autodocs", "!dev"],
};

export const Basic: Story = {
    render: () => {
        const [text, setText] = createSignal("");

        return <InlineInput text={text()} setText={setText} placeholder="Type here..." />;
    },
};

export const WithPlaceholder: Story = {
    render: () => {
        const [text, setText] = createSignal("");

        return <InlineInput text={text()} setText={setText} placeholder="Untitled" />;
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
                <p>Type to see completions:</p>
                <InlineInput
                    text={text()}
                    setText={setText}
                    placeholder="Select cell type"
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
                <p>Try keyboard navigation (arrows, backspace, delete, tab):</p>
                <InlineInput
                    text={text()}
                    setText={setText}
                    placeholder="Type here..."
                    deleteBackward={() => addEvent("Delete backward")}
                    deleteForward={() => addEvent("Delete forward")}
                    exitBackward={() => addEvent("Exit backward (Shift+Tab)")}
                    exitForward={() => addEvent("Exit forward (Tab)")}
                    exitUp={() => addEvent("Exit up")}
                    exitDown={() => addEvent("Exit down")}
                    exitLeft={() => addEvent("Exit left")}
                    exitRight={() => addEvent("Exit right")}
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
                <p>Active state controls focus:</p>
                <InlineInput
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

export const WithValidationStatus: Story = {
    render: () => {
        const [text, setText] = createSignal("");

        const getStatus = () => {
            if (!text()) {
                return "incomplete";
            }
            if (text().length < 3) {
                return "invalid";
            }
            return null;
        };

        return (
            <div style={{ padding: "16px" }}>
                <p>Type at least 3 characters:</p>
                <InlineInput
                    text={text()}
                    setText={setText}
                    placeholder="Enter at least 3 chars..."
                    status={getStatus()}
                />
                <p>
                    Status: <strong>{getStatus() || "valid"}</strong>
                </p>
            </div>
        );
    },
};

export const DocumentTitleEditor: Story = {
    render: () => {
        const [title, setTitle] = createSignal("My Document");

        return (
            <div style={{ padding: "16px", "font-size": "24px", "font-weight": "bold" }}>
                <InlineInput text={title()} setText={setTitle} placeholder="Untitled" />
            </div>
        );
    },
};

export const WithAutofill: Story = {
    render: () => {
        const [text, setText] = createSignal("");
        const [submitted, setSubmitted] = createSignal(false);

        return (
            <div style={{ padding: "16px" }}>
                <p>Press Enter to submit:</p>
                <InlineInput
                    text={text()}
                    setText={setText}
                    placeholder="Type and press Enter..."
                    autofill={() => {
                        setSubmitted(true);
                        setTimeout(() => setSubmitted(false), 2000);
                    }}
                />
                {submitted() && <p style={{ color: "green" }}>Submitted: {text()}</p>}
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
                <p>Navigate between inputs with arrows or tab:</p>
                <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
                    <InlineInput
                        text={text1()}
                        setText={setText1}
                        isActive={activeIndex() === 0}
                        exitDown={() => setActiveIndex(1)}
                        exitForward={() => setActiveIndex(1)}
                        hasFocused={() => setActiveIndex(0)}
                    />
                    <InlineInput
                        text={text2()}
                        setText={setText2}
                        isActive={activeIndex() === 1}
                        exitUp={() => setActiveIndex(0)}
                        exitDown={() => setActiveIndex(2)}
                        exitBackward={() => setActiveIndex(0)}
                        exitForward={() => setActiveIndex(2)}
                        hasFocused={() => setActiveIndex(1)}
                    />
                    <InlineInput
                        text={text3()}
                        setText={setText3}
                        isActive={activeIndex() === 2}
                        exitUp={() => setActiveIndex(1)}
                        exitBackward={() => setActiveIndex(1)}
                        hasFocused={() => setActiveIndex(2)}
                    />
                </div>
            </div>
        );
    },
};
