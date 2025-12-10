import Resizable from "@corvu/resizable";
import EllipsisVertical from "lucide-solid/icons/ellipsis-vertical";
import FilePlus from "lucide-solid/icons/file-plus";
import GripVertical from "lucide-solid/icons/grip-vertical";
import Menu from "lucide-solid/icons/menu";
import Plus from "lucide-solid/icons/plus";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import X from "lucide-solid/icons/x";
import { createSignal, For, onMount } from "solid-js";
import type { StoryObj } from "storybook-solidjs-vite";

import { ErrorAlert, Note, Question, Warning } from "./alert";
import { Button } from "./button";
import {
    type BooleanColumnSchema,
    FixedTableEditor,
    type TextColumnSchema,
} from "./fixed_table_editor";
import { FormGroup, SelectField, TextInputField } from "./form";
import { IconButton } from "./icon_button";
import { InlineInput } from "./inline_input";
import { ResizableHandle } from "./resizable";
import { Spinner } from "./spinner";
import { WarningBanner } from "./warning_banner";
import "./colors.css";

interface ColorSwatchProps {
    value: string;
}

function ColorSwatch(props: ColorSwatchProps) {
    let swatchRef: HTMLDivElement | undefined;
    const [computedColor, setComputedColor] = createSignal("");

    onMount(() => {
        if (swatchRef) {
            const computedStyle = window.getComputedStyle(swatchRef);
            const color = computedStyle.getPropertyValue("background-color");
            setComputedColor(color);
        }
    });

    return (
        <div
            style={{
                display: "flex",
                "flex-direction": "column",
                gap: "0.5rem",
                "min-width": "250px",
            }}
        >
            <div
                style={{
                    "font-family": "var(--mono-font)",
                    "font-size": "0.70rem",
                    "font-weight": "600",
                    color: "var(--color-gray-800)",
                }}
            >
                {props.value}
            </div>
            <div
                ref={swatchRef}
                style={{
                    width: "100%",
                    height: "80px",
                    background: `var(${props.value})`,
                    border: "1px solid var(--color-gray-550)",
                    "border-radius": "8px",
                    "box-shadow": "0 2px 4px var(--color-overlay-light)",
                }}
            />
            <div
                style={{
                    "font-family": "var(--mono-font)",
                    "font-size": "0.75rem",
                    color: "var(--color-gray-800)",
                    "text-align": "right",
                }}
            >
                {computedColor()}
            </div>
        </div>
    );
}

interface ColorSectionProps {
    title: string;
    colors: Array<string>;
}

function ColorSection(props: ColorSectionProps) {
    return (
        <div style={{ "margin-bottom": "3rem" }}>
            <h2 style={{ "margin-bottom": "1.5rem", "font-size": "1.5rem", "font-weight": "600" }}>
                {props.title}
            </h2>
            <div
                style={{
                    display: "grid",
                    "grid-template-columns": "repeat(auto-fill, minmax(250px, 1fr))",
                    gap: "1.5rem",
                }}
            >
                <For each={props.colors}>{(color) => <ColorSwatch value={color} />}</For>
            </div>
        </div>
    );
}

function InlineInputInvalidSection() {
    const [validText, setValidText] = createSignal("Valid input");
    const [invalidText, setInvalidText] = createSignal("Invalid input");

    return (
        <div style={{ "margin-bottom": "3rem" }}>
            <h2
                style={{
                    "margin-bottom": "1rem",
                    "font-size": "1.25rem",
                    "font-weight": "600",
                }}
            >
                Inline Input Invalid State (inline_input.css)
            </h2>
            <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                Invalid inline inputs use --color-inline-input-danger for the border to indicate
                validation errors.
            </p>
            <div
                style={{
                    padding: "1.5rem",
                    background: "var(--color-background)",
                    "border-radius": "6px",
                    border: "1px solid var(--color-gray-400)",
                }}
            >
                <div style={{ display: "flex", "flex-direction": "column", gap: "1rem" }}>
                    <div>
                        <div
                            style={{
                                "font-size": "0.875rem",
                                "margin-bottom": "0.5rem",
                                color: "var(--color-gray-800)",
                            }}
                        >
                            Valid state:
                        </div>
                        <InlineInput text={validText()} setText={setValidText} />
                    </div>
                    <div>
                        <div
                            style={{
                                "font-size": "0.875rem",
                                "margin-bottom": "0.5rem",
                                color: "var(--color-gray-800)",
                            }}
                        >
                            Invalid state:
                        </div>
                        <InlineInput
                            text={invalidText()}
                            setText={setInvalidText}
                            status="invalid"
                        />
                    </div>
                </div>
            </div>
            <div
                style={{
                    "margin-top": "1rem",
                    padding: "1rem",
                    background: "var(--color-gray-50)",
                    "border-radius": "6px",
                    "font-family": "var(--mono-font)",
                    "font-size": "0.875rem",
                }}
            >
                <div>&.invalid {"{"}</div>
                <div style={{ "padding-left": "1rem" }}>
                    border-bottom-color: var(--color-inline-input-danger);
                </div>
                <div>{"}"}</div>
            </div>
        </div>
    );
}

function InlineInputIncompleteSection() {
    const [completeText, setCompleteText] = createSignal("Complete input");
    const [incompleteText, setIncompleteText] = createSignal("Incomplete input");

    return (
        <div style={{ "margin-bottom": "3rem" }}>
            <h2
                style={{
                    "margin-bottom": "1rem",
                    "font-size": "1.25rem",
                    "font-weight": "600",
                }}
            >
                Inline Input Incomplete State (inline_input.css)
            </h2>
            <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                Inline inputs use --color-inline-input-warning for the border when in an incomplete
                state, signaling that user input is needed.
            </p>
            <div
                style={{
                    padding: "2rem",
                    background: "var(--color-background)",
                    "border-radius": "6px",
                    border: "1px solid var(--color-gray-400)",
                }}
            >
                <div style={{ display: "flex", "flex-direction": "column", gap: "1rem" }}>
                    <div>
                        <div
                            style={{
                                "font-size": "0.875rem",
                                "margin-bottom": "0.5rem",
                                color: "var(--color-gray-800)",
                            }}
                        >
                            Normal state:
                        </div>
                        <InlineInput text={completeText()} setText={setCompleteText} />
                    </div>
                    <div>
                        <div
                            style={{
                                "font-size": "0.875rem",
                                "margin-bottom": "0.5rem",
                                color: "var(--color-gray-800)",
                            }}
                        >
                            Incomplete state:
                        </div>
                        <InlineInput
                            text={incompleteText()}
                            setText={setIncompleteText}
                            status="incomplete"
                        />
                    </div>
                </div>
            </div>
            <div
                style={{
                    "margin-top": "1rem",
                    padding: "1rem",
                    background: "var(--color-gray-50)",
                    "border-radius": "6px",
                    "font-family": "var(--mono-font)",
                    "font-size": "0.875rem",
                }}
            >
                <div>&.incomplete {"{"}</div>
                <div style={{ "padding-left": "1rem" }}>
                    border-bottom-color: var(--color-inline-input-warning);
                </div>
                <div>{"}"}</div>
            </div>
        </div>
    );
}

type TableRow = { name: string; type: string; active: boolean };

function TableBordersSection() {
    const rows: TableRow[] = [
        { name: "My Model", type: "model", active: true },
        { name: "Another Model", type: "model", active: false },
    ];

    const nameColumn: TextColumnSchema<TableRow> = {
        contentType: "string",
        name: "Name",
        header: true,
        content: (row) => row.name,
    };

    const typeColumn: TextColumnSchema<TableRow> = {
        contentType: "string",
        name: "Type",
        content: (row) => row.type,
    };

    const activeColumn: BooleanColumnSchema<TableRow> = {
        contentType: "boolean",
        name: "Active",
        content: (row) => row.active,
    };

    return (
        <div style={{ "margin-bottom": "3rem" }}>
            <h2
                style={{
                    "margin-bottom": "1rem",
                    "font-size": "1.25rem",
                    "font-weight": "600",
                }}
            >
                Table Borders (documents.css, fixed_table_editor.css)
            </h2>
            <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                Tables use --color-gray-450 and --color-gray-550 for borders.
            </p>
            <div
                style={{
                    padding: "1.5rem",
                    background: "var(--color-background)",
                    "border-radius": "6px",
                    border: "1px solid var(--color-gray-400)",
                }}
            >
                <FixedTableEditor rows={rows} schema={[nameColumn, typeColumn, activeColumn]} />
            </div>
            <div
                style={{
                    "margin-top": "1rem",
                    padding: "1rem",
                    background: "var(--color-gray-50)",
                    "border-radius": "6px",
                    "font-family": "var(--mono-font)",
                    "font-size": "0.875rem",
                }}
            >
                <div>.ref-table th, .ref-table td {"{"}</div>
                <div style={{ "padding-left": "1rem" }}>
                    border-bottom: 1px solid var(--color-gray-550);
                </div>
                <div>{"}"}</div>
                <div style={{ "margin-top": "0.5rem" }}>.fixed-table-editor {"{"}</div>
                <div style={{ "padding-left": "1rem" }}>--border-color: var(--color-gray-450);</div>
                <div>{"}"}</div>
            </div>
        </div>
    );
}

const meta = {
    title: "Colors",
};

export default meta;
type Story = StoryObj<typeof meta>;

export const AllColors: Story = {
    render() {
        return (
            <div style={{ padding: "2rem", "max-width": "1400px", margin: "0 auto" }}>
                <h1 style={{ "margin-bottom": "2rem", "font-size": "2rem", "font-weight": "700" }}>
                    CatColab Color Palette
                </h1>

                <ColorSection title="Base" colors={["--color-foreground", "--color-background"]} />

                <ColorSection
                    title="Gray"
                    colors={[
                        "--color-gray-25",
                        "--color-gray-50",
                        "--color-gray-100",
                        "--color-gray-125",
                        "--color-gray-150",
                        "--color-gray-200",
                        "--color-gray-250",
                        "--color-gray-300",
                        "--color-gray-350",
                        "--color-gray-400",
                        "--color-gray-450",
                        "--color-gray-500",
                        "--color-gray-550",
                        "--color-gray-600",
                        "--color-gray-650",
                        "--color-gray-700",
                        "--color-gray-750",
                        "--color-gray-800",
                        "--color-gray-850",
                        "--color-gray-900",
                        "--color-gray-950",
                    ]}
                />

                <ColorSection
                    title="Hover Colors"
                    colors={[
                        "--color-hover-bg",
                        "--color-hover-bg-light",
                        "--color-hover-bg-medium",
                        "--color-hover-bg-dark",
                        "--color-hover-bg-strong",
                        "--color-hover-button-bg",
                        "--color-hover-button-light",
                    ]}
                />

                <ColorSection
                    title="Text Colors"
                    colors={[
                        "--color-text-secondary",
                        "--color-text-muted",
                        "--color-text-disabled",
                        "--color-text-placeholder",
                    ]}
                />

                <ColorSection
                    title="Utility"
                    colors={[
                        "--color-button-utility-bg",
                        "--color-button-utility-border",
                        "--color-button-utility-hover-bg",
                        "--color-button-utility-hover-border",
                        "--color-icon-button-utility-hover-bg",
                    ]}
                />

                <ColorSection
                    title="Positive"
                    colors={[
                        "--color-icon-button-positive-hover",
                        "--color-icon-button-positive-active",
                        "--color-button-positive-hover",
                        "--color-button-positive-base",
                        "--color-icon-button-positive-text",
                        "--color-button-positive-border",
                    ]}
                />

                <ColorSection
                    title="Danger"
                    colors={[
                        "--color-icon-button-danger-hover",
                        "--color-form-invalid-bg",
                        "--color-button-danger-hover",
                        "--color-button-danger-base",
                        "--color-inline-input-danger",
                        "--color-icon-button-danger-text",
                        "--color-form-error-text",
                        "--color-alert-danger",
                    ]}
                />

                <ColorSection
                    title="Warning"
                    colors={[
                        "--color-warning-banner-bg",
                        "--color-warning-banner-border",
                        "--color-inline-input-warning",
                        "--color-alert-warning",
                        "--color-warning-banner-text",
                    ]}
                />

                <ColorSection
                    title="Information"
                    colors={["--color-alert-question", "--color-alert-note"]}
                />

                <ColorSection
                    title="Rich Text Editor"
                    colors={[
                        "--color-rich-text-editor-border",
                        "--color-rich-text-menubar-bg",
                        "--color-rich-text-menubar-border",
                        "--color-rich-text-menubar-button-active",
                        "--color-rich-text-placeholder",
                        "--color-rich-text-blockquote-bg",
                        "--color-rich-text-blockquote-border",
                        "--color-rich-text-link-input-bg",
                        "--color-rich-text-link-input-outline",
                        "--color-rich-text-selection-bg",
                        "--color-link-editor-focus",
                        "--color-link-editor-shadow-1",
                        "--color-link-editor-shadow-2",
                        "--color-link-editor-shadow-3",
                    ]}
                />

                <ColorSection
                    title="Selection, Focus & Highlight"
                    colors={[
                        "--color-dnd-insert",
                        "--color-highlight-bg",
                        "--color-id-input-anonymous-base",
                    ]}
                />

                <ColorSection
                    title="Overlays & Shadows"
                    colors={[
                        "--color-overlay-base",
                        "--color-overlay-light",
                        "--color-shadow-base",
                        "--color-shadow-medium",
                        "--color-shadow-strong",
                        "--color-tooltip-bg",
                        "--color-link-editor-shadow-1",
                        "--color-link-editor-shadow-2",
                        "--color-link-editor-shadow-3",
                    ]}
                />

                <ColorSection
                    title="Borders & Separators"
                    colors={["--color-help-border", "--color-menu-separator"]}
                />
            </div>
        );
    },
    // excluding from autodocs and dev seems to be the way to have this
    // component as the first thing in the docs and only there
    tags: ["!autodocs", "!dev"],
};

export const ButtonColorsStudy: Story = {
    render() {
        return (
            <div style={{ padding: "2rem", "max-width": "1400px", margin: "0 auto" }}>
                <h1 style={{ "margin-bottom": "2rem", "font-size": "2rem", "font-weight": "700" }}>
                    Button Colors
                </h1>

                <div style={{ "margin-bottom": "3rem" }}>
                    <div style={{ display: "flex", gap: "1rem", "align-items": "center" }}>
                        <Button variant="positive">Positive</Button>
                        <Button variant="utility">Utility</Button>
                        <Button variant="danger">Danger</Button>
                        <Button variant="positive" disabled>
                            Disabled
                        </Button>
                    </div>
                    <Button
                        style={{
                            color: "white",
                            background: "var(--color-topos-primary)",
                            border: "1px solid var(--color-topos-primary)",
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = "var(--color-topos-primary-hover)";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = "var(--color-topos-primary)";
                        }}
                    >
                        Topos Primary
                    </Button>
                    <Button
                        style={{
                            color: "white",
                            background: "var(--color-topos-secondary)",
                            border: "1px solid var(--color-topos-secondary)",
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.opacity = "0.9";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = "1";
                        }}
                    >
                        Topos Secondary
                    </Button>
                </div>
            </div>
        );
    },
};

export const RichTextEditorColorStudy: Story = {
    render() {
        return (
            <div style={{ padding: "2rem", "max-width": "1400px", margin: "0 auto" }}>
                <h1 style={{ "margin-bottom": "2rem", "font-size": "2rem", "font-weight": "700" }}>
                    Rich Text Editor Color Usage
                </h1>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Editor Container (rich_text_editor.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-text-secondary)" }}>
                        The rich text editor container uses --color-rich-text-editor-border for the
                        focused border state to indicate when the editor is active.
                    </p>
                    <div
                        style={{
                            display: "flex",
                            gap: "2rem",
                            "flex-wrap": "wrap",
                            padding: "1.5rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                        }}
                    >
                        <div style={{ flex: "1", "min-width": "200px" }}>
                            <div
                                style={{
                                    "font-size": "0.875rem",
                                    "margin-bottom": "0.5rem",
                                    color: "var(--color-text-secondary)",
                                }}
                            >
                                Unfocused state:
                            </div>
                            <div
                                style={{
                                    border: "1px solid transparent",
                                    "border-radius": "5px",
                                    padding: "0.3em",
                                    "min-height": "60px",
                                }}
                            >
                                <div style={{ color: "var(--color-rich-text-placeholder)" }}>
                                    Placeholder text...
                                </div>
                            </div>
                        </div>
                        <div style={{ flex: "1", "min-width": "200px" }}>
                            <div
                                style={{
                                    "font-size": "0.875rem",
                                    "margin-bottom": "0.5rem",
                                    color: "var(--color-text-secondary)",
                                }}
                            >
                                Focused state:
                            </div>
                            <div
                                style={{
                                    border: "1px solid var(--color-rich-text-editor-border)",
                                    "border-radius": "5px",
                                    padding: "0.3em",
                                    "min-height": "60px",
                                }}
                            >
                                <div>Editable content here...</div>
                            </div>
                        </div>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>.rich-text-editor {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>border: 1px solid transparent;</div>
                        <div>{"}"}</div>
                        <div style={{ "margin-top": "0.5rem" }}>
                            .rich-text-editor.focussed {"{"}
                        </div>
                        <div style={{ "padding-left": "1rem" }}>
                            border: 1px solid var(--color-rich-text-editor-border);
                        </div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Menubar (rich_text_editor.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-text-secondary)" }}>
                        The toolbar menubar uses --color-rich-text-menubar-bg for background and
                        --color-rich-text-menubar-border for the border. Button hover states use
                        --color-hover-button-bg, and active buttons use
                        --color-rich-text-menubar-button-active.
                    </p>
                    <div
                        style={{
                            padding: "1.5rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                "flex-direction": "row",
                                "justify-content": "space-between",
                                "border-radius": "5px",
                                border: "1px solid var(--color-rich-text-menubar-border)",
                                "background-color": "var(--color-rich-text-menubar-bg)",
                                padding: "2px",
                            }}
                        >
                            <div style={{ display: "flex", gap: "2px" }}>
                                <button
                                    type="button"
                                    style={{
                                        padding: "6px 10px",
                                        border: "none",
                                        background: "transparent",
                                        cursor: "pointer",
                                        "border-radius": "4px",
                                        "font-weight": "bold",
                                        transition: "background-color 0.2s ease",
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor =
                                            "var(--color-hover-button-bg)";
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = "transparent";
                                    }}
                                >
                                    B
                                </button>
                                <button
                                    type="button"
                                    style={{
                                        padding: "6px 10px",
                                        border: "none",
                                        background: "transparent",
                                        cursor: "pointer",
                                        "border-radius": "4px",
                                        "font-style": "italic",
                                        transition: "background-color 0.2s ease",
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor =
                                            "var(--color-hover-button-bg)";
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = "transparent";
                                    }}
                                >
                                    I
                                </button>
                                <button
                                    type="button"
                                    style={{
                                        padding: "6px 10px",
                                        border: "none",
                                        "background-color":
                                            "var(--color-rich-text-menubar-button-active)",
                                        cursor: "pointer",
                                        "border-radius": "4px",
                                        "text-decoration": "underline",
                                    }}
                                >
                                    U
                                </button>
                                <select
                                    style={{
                                        background: "transparent",
                                        border: "none",
                                        padding: "6px",
                                        cursor: "pointer",
                                    }}
                                >
                                    <option>Paragraph</option>
                                    <option>Heading 1</option>
                                    <option>Heading 2</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>.menubar {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            border: 1px solid var(--color-rich-text-menubar-border);
                        </div>
                        <div style={{ "padding-left": "1rem" }}>
                            background-color: var(--color-rich-text-menubar-bg);
                        </div>
                        <div>{"}"}</div>
                        <div style={{ "margin-top": "0.5rem" }}>.menubar button:hover {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            background-color: var(--color-hover-button-bg);
                        </div>
                        <div>{"}"}</div>
                        <div style={{ "margin-top": "0.5rem" }}>.menubar button.active {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            background-color: var(--color-rich-text-menubar-button-active);
                        </div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Text Selection (rich_text_editor.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-text-secondary)" }}>
                        Selected nodes in the editor use --color-rich-text-selection-bg for a warm
                        yellow highlight that stands out clearly.
                    </p>
                    <div
                        style={{
                            padding: "1.5rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                        }}
                    >
                        <p>
                            This is some text with{" "}
                            <span style={{ background: "var(--color-rich-text-selection-bg)" }}>
                                selected content that spans multiple words
                            </span>{" "}
                            in the editor.
                        </p>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>.is-selected {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            background-color: var(--color-rich-text-selection-bg);
                        </div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Blockquote (rich_text_editor.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-text-secondary)" }}>
                        Blockquotes use --color-rich-text-blockquote-bg for a subtle background and
                        --color-rich-text-blockquote-border for a prominent left border.
                    </p>
                    <div
                        style={{
                            padding: "1.5rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                        }}
                    >
                        <blockquote
                            style={{
                                background: "var(--color-rich-text-blockquote-bg)",
                                "border-left":
                                    "10px solid var(--color-rich-text-blockquote-border)",
                                margin: "1em 10px",
                                padding: "0.5em 10px",
                            }}
                        >
                            This is a blockquote element styled with the rich text editor colors.
                        </blockquote>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>blockquote {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            background: var(--color-rich-text-blockquote-bg);
                        </div>
                        <div style={{ "padding-left": "1rem" }}>
                            border-left: 10px solid var(--color-rich-text-blockquote-border);
                        </div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Tooltip (rich_text_editor.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-text-secondary)" }}>
                        Menubar button tooltips use --color-tooltip-bg for a dark background with
                        --color-background for contrast text.
                    </p>
                    <div
                        style={{
                            display: "flex",
                            "justify-content": "center",
                            padding: "3rem",
                            background: "var(--color-gray-100)",
                            "border-radius": "6px",
                        }}
                    >
                        <div style={{ position: "relative" }}>
                            <button
                                type="button"
                                style={{
                                    padding: "8px 16px",
                                    border: "1px solid var(--color-gray-400)",
                                    background: "var(--color-background)",
                                    "border-radius": "4px",
                                    cursor: "pointer",
                                }}
                            >
                                Hover me
                            </button>
                            <div
                                style={{
                                    position: "absolute",
                                    bottom: "calc(100% + 8px)",
                                    left: "50%",
                                    transform: "translateX(-50%)",
                                    background: "var(--color-tooltip-bg)",
                                    color: "var(--color-background)",
                                    padding: "4px 8px",
                                    "border-radius": "4px",
                                    "font-size": "0.75rem",
                                    "white-space": "nowrap",
                                }}
                            >
                                Bold (shortcut: Mod+b)
                            </div>
                        </div>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>.tooltipButton.tooltip::after {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            background: var(--color-tooltip-bg);
                        </div>
                        <div style={{ "padding-left": "1rem" }}>
                            color: var(--color-background);
                        </div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Link Editor Popup (rich_text_editor.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-text-secondary)" }}>
                        The link editor popup uses a layered shadow effect with three custom shadow
                        colors, --color-rich-text-link-input-bg for input backgrounds,
                        --color-rich-text-link-input-outline for the input outline, and
                        --color-link-editor-focus for focus states.
                    </p>
                    <div
                        style={{
                            display: "flex",
                            "justify-content": "center",
                            padding: "3rem",
                            background: "var(--color-gray-100)",
                            "border-radius": "6px",
                        }}
                    >
                        <div
                            style={{
                                "padding-left": "12px",
                                "padding-right": "12px",
                                "padding-bottom": "12px",
                                "border-radius": "10px",
                                background: "var(--color-background)",
                                "max-width": "330px",
                                width: "100%",
                                "box-shadow":
                                    "var(--color-link-editor-shadow-1) 0px 14px 28px -6px, var(--color-link-editor-shadow-2) 0px 2px 4px -1px, var(--color-link-editor-shadow-3) 0px 0px 0px 1px",
                            }}
                        >
                            <div style={{ "margin-top": "12px" }}>
                                <div
                                    style={{
                                        "font-size": "0.875rem",
                                        color: "var(--color-text-secondary)",
                                    }}
                                >
                                    URL
                                </div>
                                <input
                                    type="text"
                                    value="https://example.com"
                                    style={{
                                        "margin-top": "8px",
                                        background: "var(--color-rich-text-link-input-bg)",
                                        outline: "none",
                                        border: "0",
                                        "box-shadow":
                                            "0 0 0 1px var(--color-rich-text-link-input-outline)",
                                        "border-radius": "6px",
                                        "box-sizing": "border-box",
                                        "padding-inline": "8px",
                                        "line-height": "28px",
                                        width: "100%",
                                    }}
                                    readonly
                                />
                            </div>
                            <div style={{ "margin-top": "12px" }}>
                                <div
                                    style={{
                                        "font-size": "0.875rem",
                                        color: "var(--color-text-secondary)",
                                    }}
                                >
                                    Title
                                </div>
                                <input
                                    type="text"
                                    value="Example Link"
                                    style={{
                                        "margin-top": "8px",
                                        background: "var(--color-rich-text-link-input-bg)",
                                        outline: "none",
                                        border: "0",
                                        "box-shadow":
                                            "var(--color-link-editor-focus) 0px 0px 0px 1px inset, var(--color-link-editor-focus) 0px 0px 0px 1px",
                                        "border-radius": "6px",
                                        "box-sizing": "border-box",
                                        "padding-inline": "8px",
                                        "line-height": "28px",
                                        width: "100%",
                                    }}
                                    readonly
                                />
                            </div>
                        </div>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>.link-editor-popup {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            background: var(--color-background);
                        </div>
                        <div style={{ "padding-left": "1rem" }}>box-shadow:</div>
                        <div style={{ "padding-left": "2rem" }}>
                            var(--color-link-editor-shadow-1) 0px 14px 28px -6px,
                        </div>
                        <div style={{ "padding-left": "2rem" }}>
                            var(--color-link-editor-shadow-2) 0px 2px 4px -1px,
                        </div>
                        <div style={{ "padding-left": "2rem" }}>
                            var(--color-link-editor-shadow-3) 0px 0px 0px 1px;
                        </div>
                        <div>{"}"}</div>
                        <div style={{ "margin-top": "0.5rem" }}>.link-editor-popup input {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            background: var(--color-rich-text-link-input-bg);
                        </div>
                        <div style={{ "padding-left": "1rem" }}>
                            box-shadow: 0 0 0 1px var(--color-rich-text-link-input-outline);
                        </div>
                        <div>{"}"}</div>
                        <div style={{ "margin-top": "0.5rem" }}>
                            .link-editor-popup input:focus {"{"}
                        </div>
                        <div style={{ "padding-left": "1rem" }}>box-shadow:</div>
                        <div style={{ "padding-left": "2rem" }}>
                            var(--color-link-editor-focus) 0px 0px 0px 1px inset,
                        </div>
                        <div style={{ "padding-left": "2rem" }}>
                            var(--color-link-editor-focus) 0px 0px 0px 1px;
                        </div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Placeholder Text (rich_text_editor.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-text-secondary)" }}>
                        Empty editor placeholder text uses --color-rich-text-placeholder for a
                        subtle but visible hint.
                    </p>
                    <div
                        style={{
                            padding: "1.5rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                        }}
                    >
                        <div
                            style={{
                                border: "1px solid var(--color-rich-text-editor-border)",
                                "border-radius": "5px",
                                padding: "0.3em",
                                "min-height": "60px",
                                position: "relative",
                            }}
                        >
                            <div
                                style={{
                                    color: "var(--color-rich-text-placeholder)",
                                    position: "absolute",
                                    "pointer-events": "none",
                                }}
                            >
                                Enter your content here...
                            </div>
                        </div>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>.ProseMirror[data-placeholder]::before {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            color: var(--color-rich-text-placeholder);
                        </div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Rich Text Editor Color Variables Overview
                    </h2>
                    <div
                        style={{
                            display: "grid",
                            "grid-template-columns": "repeat(auto-fill, minmax(250px, 1fr))",
                            gap: "1.5rem",
                        }}
                    >
                        <ColorSwatch value="--color-rich-text-editor-border" />
                        <ColorSwatch value="--color-rich-text-menubar-bg" />
                        <ColorSwatch value="--color-rich-text-menubar-border" />
                        <ColorSwatch value="--color-rich-text-menubar-button-active" />
                        <ColorSwatch value="--color-rich-text-placeholder" />
                        <ColorSwatch value="--color-rich-text-blockquote-bg" />
                        <ColorSwatch value="--color-rich-text-blockquote-border" />
                        <ColorSwatch value="--color-rich-text-link-input-bg" />
                        <ColorSwatch value="--color-rich-text-link-input-outline" />
                        <ColorSwatch value="--color-hover-button-bg" />
                        <ColorSwatch value="--color-rich-text-selection-bg" />
                        <ColorSwatch value="--color-tooltip-bg" />
                        <ColorSwatch value="--color-link-editor-focus" />
                        <ColorSwatch value="--color-link-editor-shadow-1" />
                        <ColorSwatch value="--color-link-editor-shadow-2" />
                        <ColorSwatch value="--color-link-editor-shadow-3" />
                    </div>
                </div>
            </div>
        );
    },
};

export const GrayColorUsage: Story = {
    render() {
        return (
            <div style={{ padding: "2rem", "max-width": "1400px", margin: "0 auto" }}>
                <h1 style={{ "margin-bottom": "2rem", "font-size": "2rem", "font-weight": "700" }}>
                    Gray Color Usage Examples
                </h1>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Form Inputs (global.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Input fields use --color-gray-100 for background and --color-gray-450 for
                        borders.
                    </p>
                    <div
                        style={{
                            padding: "1.5rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                        }}
                    >
                        <FormGroup>
                            <TextInputField label="Text input" placeholder="Enter text..." />
                            <SelectField label="Select">
                                <option>Option 1</option>
                                <option>Option 2</option>
                            </SelectField>
                        </FormGroup>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>input, select {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            background: var(--color-gray-100);
                        </div>
                        <div style={{ "padding-left": "1rem" }}>
                            border: 1px solid var(--color-gray-450);
                        </div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Sidebar (sidebar_layout.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        The sidebar uses --color-gray-50 for background, --color-gray-150 for its
                        border and active states, and --color-gray-800 for text.
                    </p>
                    <div
                        style={{
                            display: "flex",
                            height: "200px",
                            "border-radius": "6px",
                            overflow: "hidden",
                            border: "1px solid var(--color-gray-400)",
                        }}
                    >
                        <div
                            style={{
                                width: "200px",
                                "background-color": "var(--color-gray-50)",
                                "border-right": "2px solid var(--color-gray-150)",
                                color: "var(--color-gray-800)",
                                padding: "1rem",
                            }}
                        >
                            <div
                                style={{
                                    padding: "5px 8px",
                                    "border-radius": "6px",
                                    cursor: "pointer",
                                    "margin-bottom": "0.5rem",
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = "var(--color-hover-bg)";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "transparent";
                                }}
                            >
                                Document 1
                            </div>
                            <div
                                style={{
                                    padding: "5px 8px",
                                    "border-radius": "6px",
                                    background: "var(--color-gray-150)",
                                    cursor: "pointer",
                                }}
                            >
                                Active Document
                            </div>
                        </div>
                        <div
                            style={{
                                flex: 1,
                                background: "var(--color-background)",
                                padding: "1rem",
                            }}
                        >
                            Main content area
                        </div>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>.sidebar {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            background-color: var(--color-gray-50);
                        </div>
                        <div style={{ "padding-left": "1rem" }}>
                            border-right: 2px solid var(--color-gray-150);
                        </div>
                        <div style={{ "padding-left": "1rem" }}>color: var(--color-gray-800);</div>
                        <div>{"}"}</div>
                        <div style={{ "margin-top": "0.5rem" }}>.related-document.active {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            background: var(--color-gray-150);
                        </div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Resource Cards (home_page.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Home page resource links use --color-gray-100 for background,
                        --color-gray-850 for text, and --color-gray-400 for dividers.
                    </p>
                    <div
                        style={{
                            padding: "1.5rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                        }}
                    >
                        <div
                            style={{
                                "padding-bottom": "1rem",
                                "margin-bottom": "1rem",
                                "border-bottom": "1px solid var(--color-gray-400)",
                            }}
                        >
                            <div style={{ color: "var(--color-gray-800)" }}>
                                Quick actions section with divider
                            </div>
                        </div>
                        <div
                            style={{
                                display: "grid",
                                "grid-template-columns": "1fr 1fr",
                                gap: "1rem",
                            }}
                        >
                            <div
                                style={{
                                    padding: "12px 15px",
                                    background: "var(--color-gray-100)",
                                    "border-radius": "8px",
                                    color: "var(--color-gray-850)",
                                    cursor: "pointer",
                                    transition: "all 0.2s",
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background =
                                        "var(--color-hover-bg-medium)";
                                    e.currentTarget.style.transform = "translateY(-2px)";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "var(--color-gray-100)";
                                    e.currentTarget.style.transform = "translateY(0)";
                                }}
                            >
                                Resource Link
                            </div>
                            <div
                                style={{
                                    padding: "12px 15px",
                                    background: "var(--color-gray-100)",
                                    "border-radius": "8px",
                                    color: "var(--color-gray-850)",
                                    cursor: "pointer",
                                    transition: "all 0.2s",
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background =
                                        "var(--color-hover-bg-medium)";
                                    e.currentTarget.style.transform = "translateY(-2px)";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "var(--color-gray-100)";
                                    e.currentTarget.style.transform = "translateY(0)";
                                }}
                            >
                                Another Link
                            </div>
                        </div>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>.resource-link {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            background: var(--color-gray-100);
                        </div>
                        <div style={{ "padding-left": "1rem" }}>color: var(--color-gray-850);</div>
                        <div>{"}"}</div>
                        <div style={{ "margin-top": "0.5rem" }}>.quick-actions {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            border-bottom: 1px solid var(--color-gray-400);
                        </div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Toolbar Icons (toolbar.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Toolbar icons and the brand link use --color-gray-800.
                    </p>
                    <div
                        style={{
                            padding: "1rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                            display: "flex",
                            "align-items": "center",
                            gap: "1rem",
                        }}
                    >
                        <div style={{ color: "var(--color-gray-800)" }}>
                            <Menu size={20} />
                        </div>
                        <div
                            style={{
                                display: "flex",
                                "align-items": "center",
                                gap: "5px",
                                color: "var(--color-gray-800)",
                                "font-size": "1.3rem",
                                padding: "0.25rem",
                                "border-radius": "5px",
                                cursor: "pointer",
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = "var(--color-hover-bg-light)";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = "transparent";
                            }}
                        >
                            <span
                                style={{
                                    width: "24px",
                                    height: "24px",
                                    background: "var(--color-gray-600)",
                                    "border-radius": "4px",
                                }}
                            />
                            <span>CatColab</span>
                        </div>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>.toolbar .lucide {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>color: var(--color-gray-800);</div>
                        <div>{"}"}</div>
                        <div style={{ "margin-top": "0.5rem" }}>.brand {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>color: var(--color-gray-800);</div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Notebook Cell Gutter (notebook_cell.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Cell gutter icons and tags use --color-gray-600 for a muted appearance.
                    </p>
                    <div
                        style={{
                            padding: "1.5rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                        }}
                    >
                        <div style={{ display: "flex", "align-items": "center", gap: "1rem" }}>
                            <div
                                style={{
                                    display: "flex",
                                    gap: "0.5rem",
                                    color: "var(--color-gray-600)",
                                }}
                            >
                                <Plus size={20} />
                                <GripVertical size={20} />
                            </div>
                            <div style={{ flex: 1 }}>Cell content goes here...</div>
                            <div style={{ color: "var(--color-gray-600)", "font-size": "11pt" }}>
                                object
                            </div>
                        </div>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>.cell-gutter .lucide {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>color: var(--color-gray-600);</div>
                        <div>{"}"}</div>
                        <div style={{ "margin-top": "0.5rem" }}>.cell-tag {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>color: var(--color-gray-600);</div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Menu Items (menubar.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Menu items use --color-gray-800 for icons, with --color-gray-600 for
                        disabled states.
                    </p>
                    <div
                        style={{
                            padding: "1rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                            "max-width": "250px",
                        }}
                    >
                        <div
                            style={{ display: "flex", "flex-direction": "column", gap: "0.25rem" }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    gap: "1ex",
                                    "align-items": "center",
                                    padding: "0.5ex",
                                    cursor: "pointer",
                                    "border-radius": "4px",
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = "var(--color-highlight-bg)";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "transparent";
                                }}
                            >
                                <FilePlus style={{ color: "var(--color-gray-800)" }} />
                                <span>New model</span>
                            </div>
                            <div
                                style={{
                                    display: "flex",
                                    gap: "1ex",
                                    "align-items": "center",
                                    padding: "0.5ex",
                                    color: "var(--color-gray-600)",
                                    cursor: "default",
                                }}
                            >
                                <X style={{ color: "var(--color-gray-600)" }} />
                                <span>Disabled item</span>
                            </div>
                        </div>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>.menu [role="menuitem"] .lucide {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>color: var(--color-gray-800);</div>
                        <div>{"}"}</div>
                        <div style={{ "margin-top": "0.5rem" }}>
                            .menu [role="menuitem"][data-disabled] {"{"}
                        </div>
                        <div style={{ "padding-left": "1rem" }}>color: var(--color-gray-600);</div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <TableBordersSection />

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Help Tables (help_layout.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Help page tables use --color-gray-750 for header backgrounds and
                        --color-gray-125 for alternating row backgrounds.
                    </p>
                    <div
                        style={{
                            padding: "1.5rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                        }}
                    >
                        <table style={{ width: "100%", "border-collapse": "collapse" }}>
                            <thead>
                                <tr>
                                    <th
                                        style={{
                                            "text-align": "left",
                                            padding: "0.5rem 1rem",
                                            "background-color": "var(--color-gray-750)",
                                            color: "var(--color-background)",
                                        }}
                                    >
                                        Feature
                                    </th>
                                    <th
                                        style={{
                                            "text-align": "left",
                                            padding: "0.5rem 1rem",
                                            "background-color": "var(--color-gray-750)",
                                            color: "var(--color-background)",
                                        }}
                                    >
                                        Description
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td style={{ padding: "0.5rem 1rem" }}>Objects</td>
                                    <td style={{ padding: "0.5rem 1rem" }}>
                                        Define things in your model
                                    </td>
                                </tr>
                                <tr style={{ "background-color": "var(--color-gray-125)" }}>
                                    <td style={{ padding: "0.5rem 1rem" }}>Morphisms</td>
                                    <td style={{ padding: "0.5rem 1rem" }}>Define relationships</td>
                                </tr>
                                <tr>
                                    <td style={{ padding: "0.5rem 1rem" }}>Equations</td>
                                    <td style={{ padding: "0.5rem 1rem" }}>Define equalities</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>table th {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            background-color: var(--color-gray-750);
                        </div>
                        <div style={{ "padding-left": "1rem" }}>
                            color: var(--color-background);
                        </div>
                        <div>{"}"}</div>
                        <div style={{ "margin-top": "0.5rem" }}>tr:nth-child(even) {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            background-color: var(--color-gray-125);
                        </div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Spinner (spinner.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        The loading spinner uses --color-gray-900 for the spinning segment.
                    </p>
                    <div
                        style={{
                            display: "flex",
                            "justify-content": "center",
                            padding: "2rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                        }}
                    >
                        <Spinner />
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>.spinner {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            border: 4px solid var(--color-overlay-light);
                        </div>
                        <div style={{ "padding-left": "1rem" }}>
                            border-top-color: var(--color-gray-900);
                        </div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Resizable Handle (resizable.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        The resizable handle uses --color-gray-750 for hover and active states to
                        indicate interactivity.
                    </p>
                    <Resizable
                        orientation="horizontal"
                        style={{
                            display: "flex",
                            height: "150px",
                            "border-radius": "6px",
                            overflow: "hidden",
                            border: "1px solid var(--color-gray-400)",
                        }}
                    >
                        <Resizable.Panel
                            initialSize={0.5}
                            minSize={0.2}
                            style={{
                                padding: "1rem",
                                background: "var(--color-gray-50)",
                            }}
                        >
                            Left panel
                        </Resizable.Panel>
                        <ResizableHandle />
                        <Resizable.Panel
                            initialSize={0.5}
                            minSize={0.2}
                            style={{
                                padding: "1rem",
                                background: "var(--color-gray-50)",
                            }}
                        >
                            Right panel
                        </Resizable.Panel>
                    </Resizable>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>.resizable-handle:hover {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            background: var(--color-gray-750);
                        </div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Login Separator (login.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        The login form separator uses --color-gray-750 to create a horizontal rule
                        between authentication methods.
                    </p>
                    <div
                        style={{
                            padding: "1.5rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                            "max-width": "300px",
                        }}
                    >
                        <div style={{ "margin-bottom": "1rem", "text-align": "center" }}>
                            Email login form
                        </div>
                        <div
                            style={{
                                display: "flex",
                                "align-items": "center",
                                "text-align": "center",
                                margin: "1rem 0",
                            }}
                        >
                            <div
                                style={{
                                    flex: 1,
                                    "border-bottom": "2px solid var(--color-gray-750)",
                                    "margin-right": "0.5em",
                                }}
                            />
                            <span>Or continue with</span>
                            <div
                                style={{
                                    flex: 1,
                                    "border-bottom": "2px solid var(--color-gray-750)",
                                    "margin-left": "0.5em",
                                }}
                            />
                        </div>
                        <div style={{ "text-align": "center" }}>Social login buttons</div>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>.separator::before, .separator::after {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            border-bottom: 2px solid var(--color-gray-750);
                        </div>
                        <div>{"}"}</div>
                    </div>
                </div>
            </div>
        );
    },
};

export const HoverColorUsage: Story = {
    render() {
        return (
            <div style={{ padding: "2rem", "max-width": "1400px", margin: "0 auto" }}>
                <h1 style={{ "margin-bottom": "2rem", "font-size": "2rem", "font-weight": "700" }}>
                    Hover Color Usage Examples
                </h1>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Hover Background Light (toolbar.css)
                    </h2>
                    <div
                        style={{
                            padding: "1.5rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                        }}
                    >
                        <div
                            style={{
                                display: "inline-flex",
                                "flex-direction": "row",
                                "align-items": "center",
                                gap: "5px",
                                padding: "0.5rem",
                                "border-radius": "5px",
                                cursor: "pointer",
                                transition: "background 0.2s",
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = "var(--color-hover-bg-light)";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = "transparent";
                            }}
                        >
                            Brand Link
                        </div>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>&:hover {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            background: var(--color-hover-bg-light);
                        </div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Hover Background Medium (home_page.css)
                    </h2>
                    <div
                        style={{
                            padding: "1.5rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                "align-items": "center",
                                padding: "12px 15px",
                                background: "var(--color-gray-100)",
                                "border-radius": "8px",
                                cursor: "pointer",
                                transition: "all 0.2s",
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = "var(--color-hover-bg-medium)";
                                e.currentTarget.style.transform = "translateY(-2px)";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = "var(--color-gray-100)";
                                e.currentTarget.style.transform = "translateY(0)";
                            }}
                        >
                            Resource Link
                        </div>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>.resource-link:hover {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            background: var(--color-hover-bg-medium);
                        </div>
                        <div style={{ "padding-left": "1rem" }}>transform: translateY(-2px);</div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Hover Background Dark (sidebar_layout.css)
                    </h2>
                    <div
                        style={{
                            padding: "1.5rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                        }}
                    >
                        <div style={{ display: "flex", "flex-direction": "column", gap: "0.5rem" }}>
                            <div
                                style={{
                                    padding: "5px 8px",
                                    "border-radius": "6px",
                                    cursor: "pointer",
                                    transition: "background 20ms",
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = "var(--color-hover-bg)";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "transparent";
                                }}
                            >
                                Normal Document
                            </div>
                            <div
                                style={{
                                    padding: "5px 8px",
                                    "border-radius": "6px",
                                    cursor: "pointer",
                                    transition: "background 20ms",
                                    background: "var(--color-gray-150)",
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = "var(--color-hover-bg-dark)";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "var(--color-gray-150)";
                                }}
                            >
                                Active Document
                            </div>
                        </div>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>&.active:hover {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            background: var(--color-hover-bg-dark);
                        </div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Hover Background Strong (sidebar_layout.css)
                    </h2>
                    <div
                        style={{
                            padding: "1.5rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                        }}
                    >
                        <div
                            style={{
                                padding: "5px 8px",
                                "border-radius": "6px",
                                cursor: "pointer",
                                transition: "background 20ms",
                                display: "flex",
                                "justify-content": "space-between",
                                "align-items": "center",
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = "var(--color-hover-bg)";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = "transparent";
                            }}
                        >
                            <span>Document with actions</span>
                            <button
                                type="button"
                                style={{
                                    padding: "4px",
                                    border: "none",
                                    background: "transparent",
                                    cursor: "pointer",
                                    "border-radius": "4px",
                                    transition: "background 0.2s",
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background =
                                        "var(--color-hover-bg-strong)";
                                    e.stopPropagation();
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "transparent";
                                }}
                            >
                                ...
                            </button>
                        </div>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>.document-actions:hover .icon-button {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            background-color: var(--color-hover-bg-strong);
                        </div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Hover Button Background (rich_text_editor.css)
                    </h2>
                    <div
                        style={{
                            padding: "1.5rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                gap: "0.25rem",
                                padding: "0.5rem",
                                background: "var(--color-gray-100)",
                                "border-radius": "4px",
                            }}
                        >
                            <button
                                type="button"
                                style={{
                                    padding: "4px 8px",
                                    border: "none",
                                    background: "transparent",
                                    cursor: "pointer",
                                    "border-radius": "4px",
                                    transition: "background 0.2s",
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background =
                                        "var(--color-hover-button-bg)";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "transparent";
                                }}
                            >
                                <strong>B</strong>
                            </button>
                            <button
                                type="button"
                                style={{
                                    padding: "4px 8px",
                                    border: "none",
                                    background: "transparent",
                                    cursor: "pointer",
                                    "border-radius": "4px",
                                    transition: "background 0.2s",
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background =
                                        "var(--color-hover-button-bg)";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "transparent";
                                }}
                            >
                                <em>I</em>
                            </button>
                            <button
                                type="button"
                                style={{
                                    padding: "4px 8px",
                                    border: "none",
                                    background: "transparent",
                                    cursor: "pointer",
                                    "border-radius": "4px",
                                    transition: "background 0.2s",
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background =
                                        "var(--color-hover-button-bg)";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "transparent";
                                }}
                            >
                                <u>U</u>
                            </button>
                        </div>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>.menubar button:hover {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            background-color: var(--color-hover-button-bg);
                        </div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Hover Button Light (home_page.css)
                    </h2>
                    <div
                        style={{
                            padding: "1.5rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                        }}
                    >
                        <button
                            type="button"
                            style={{
                                padding: "10px 20px",
                                background: "var(--color-background)",
                                border: "1px solid var(--color-gray-700)",
                                "border-radius": "5px",
                                cursor: "pointer",
                                "font-size": "16px",
                                transition: "background 0.2s",
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background =
                                    "var(--color-hover-button-light)";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = "var(--color-background)";
                            }}
                        >
                            Outline Button
                        </button>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>.home-nav-button.outline:hover {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            background-color: var(--color-hover-button-light);
                        </div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Hover Color Variables Overview
                    </h2>
                    <div
                        style={{
                            display: "grid",
                            "grid-template-columns": "repeat(auto-fill, minmax(250px, 1fr))",
                            gap: "1.5rem",
                        }}
                    >
                        <ColorSwatch value="--color-hover-bg" />
                        <ColorSwatch value="--color-hover-bg-light" />
                        <ColorSwatch value="--color-hover-bg-medium" />
                        <ColorSwatch value="--color-hover-bg-dark" />
                        <ColorSwatch value="--color-hover-bg-strong" />
                        <ColorSwatch value="--color-hover-button-bg" />
                        <ColorSwatch value="--color-hover-button-light" />
                    </div>
                </div>
            </div>
        );
    },
};

export const UtilityColorUsage: Story = {
    render() {
        return (
            <div style={{ padding: "2rem", "max-width": "1400px", margin: "0 auto" }}>
                <h1 style={{ "margin-bottom": "2rem", "font-size": "2rem", "font-weight": "700" }}>
                    Utility Color Usage Examples
                </h1>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Button Utility Variant (button.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Utility buttons use --color-button-utility-bg for background and
                        --color-button-utility-border for border. On hover, they transition to
                        --color-button-utility-hover-bg and --color-button-utility-hover-border.
                    </p>
                    <div style={{ display: "flex", gap: "1rem", "align-items": "center" }}>
                        <Button variant="utility">Utility Button</Button>
                        <Button variant="utility" disabled>
                            Disabled Utility
                        </Button>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>background: var(--color-button-utility-bg);</div>
                        <div>border: 1px solid var(--color-button-utility-border);</div>
                        <div>
                            &:hover {"{"} background: var(--color-button-utility-hover-bg);
                            border-color: var(--color-button-utility-hover-border); {"}"}
                        </div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        IconButton Base Variant (icon_button.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Icon buttons use transparent background by default. On hover, they use
                        --color-icon-button-utility-hover-bg for background.
                    </p>
                    <div
                        style={{
                            display: "flex",
                            gap: "1rem",
                            "align-items": "center",
                            padding: "1rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                        }}
                    >
                        <IconButton tooltip="More options">
                            <EllipsisVertical size={20} />
                        </IconButton>
                        <span style={{ color: "var(--color-gray-800)", "font-size": "0.875rem" }}>
                            (Hover to see state)
                        </span>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>background: none;</div>
                        <div>
                            &:hover:enabled {"{"} background:
                            var(--color-icon-button-utility-hover-bg); border-radius: 5px; {"}"}
                        </div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Utility Color Variables Overview
                    </h2>
                    <div
                        style={{
                            display: "grid",
                            "grid-template-columns": "repeat(auto-fill, minmax(250px, 1fr))",
                            gap: "1.5rem",
                        }}
                    >
                        <ColorSwatch value="--color-button-utility-bg" />
                        <ColorSwatch value="--color-button-utility-border" />
                        <ColorSwatch value="--color-button-utility-hover-bg" />
                        <ColorSwatch value="--color-button-utility-hover-border" />
                        <ColorSwatch value="--color-icon-button-utility-hover-bg" />
                    </div>
                </div>
            </div>
        );
    },
};

export const PositiveColorUsage: Story = {
    render() {
        return (
            <div style={{ padding: "2rem", "max-width": "1400px", margin: "0 auto" }}>
                <h1 style={{ "margin-bottom": "2rem", "font-size": "2rem", "font-weight": "700" }}>
                    Positive Color Usage Examples
                </h1>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Button Component (button.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Positive buttons use --color-button-positive-base for background and
                        --color-button-positive-border for border. On hover, they transition to
                        --color-button-positive-hover.
                    </p>
                    <div style={{ display: "flex", gap: "1rem", "align-items": "center" }}>
                        <Button variant="positive">Positive Button</Button>
                        <Button variant="positive" disabled>
                            Disabled Positive
                        </Button>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>background: var(--color-button-positive-base);</div>
                        <div>border: 1px solid var(--color-button-positive-border);</div>
                        <div>
                            &:hover {"{"} background: var(--color-button-positive-hover); {"}"}
                        </div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        IconButton Positive Variant (icon_button.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Positive icon buttons use transparent background by default. On hover, they
                        use --color-icon-button-positive-hover for background and
                        --color-icon-button-positive-text for color. On active, they use
                        --color-icon-button-positive-active.
                    </p>
                    <div
                        style={{
                            display: "flex",
                            gap: "1rem",
                            "align-items": "center",
                            padding: "1rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                        }}
                    >
                        <IconButton variant="positive" tooltip="Restore">
                            <RotateCcw size={20} />
                        </IconButton>
                        <span style={{ color: "var(--color-gray-800)", "font-size": "0.875rem" }}>
                            (Hover and click to see states)
                        </span>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>background: transparent;</div>
                        <div>color: var(--color-gray-800);</div>
                        <div>
                            &:hover {"{"} background-color: var(--color-icon-button-positive-hover);
                            color: var(--color-icon-button-positive-text); {"}"}
                        </div>
                        <div>
                            &:active {"{"} background-color:
                            var(--color-icon-button-positive-active); {"}"}
                        </div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Color Variables Overview
                    </h2>
                    <div
                        style={{
                            display: "grid",
                            "grid-template-columns": "repeat(auto-fill, minmax(250px, 1fr))",
                            gap: "1.5rem",
                        }}
                    >
                        <ColorSwatch value="--color-icon-button-positive-hover" />
                        <ColorSwatch value="--color-icon-button-positive-active" />
                        <ColorSwatch value="--color-button-positive-hover" />
                        <ColorSwatch value="--color-button-positive-base" />
                        <ColorSwatch value="--color-icon-button-positive-text" />
                        <ColorSwatch value="--color-button-positive-border" />
                    </div>
                </div>
            </div>
        );
    },
};

export const DangerColorUsage: Story = {
    render() {
        return (
            <div style={{ padding: "2rem", "max-width": "1400px", margin: "0 auto" }}>
                <h1 style={{ "margin-bottom": "2rem", "font-size": "2rem", "font-weight": "700" }}>
                    Danger Color Usage Examples
                </h1>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Button Danger Variant (button.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Danger buttons use --color-button-danger-base for both background and
                        border. On hover, they transition to --color-button-danger-hover.
                    </p>
                    <div style={{ display: "flex", gap: "1rem", "align-items": "center" }}>
                        <Button variant="danger">Delete</Button>
                        <Button variant="danger" disabled>
                            Disabled Danger
                        </Button>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>background: var(--color-button-danger-base);</div>
                        <div>border: 1px solid var(--color-button-danger-base);</div>
                        <div>
                            &:hover {"{"} background: var(--color-button-danger-hover); {"}"}
                        </div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        IconButton Danger Variant (icon_button.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Danger icon buttons use transparent background by default. On hover, they
                        use --color-icon-button-danger-hover for background and
                        --color-icon-button-danger-text for color.
                    </p>
                    <div
                        style={{
                            display: "flex",
                            gap: "1rem",
                            "align-items": "center",
                            padding: "1rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                        }}
                    >
                        <IconButton variant="danger" tooltip="Delete">
                            <X size={20} />
                        </IconButton>
                        <span style={{ color: "var(--color-gray-800)", "font-size": "0.875rem" }}>
                            (Hover to see state)
                        </span>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>background: transparent;</div>
                        <div>
                            &:hover {"{"} background-color: var(--color-icon-button-danger-hover);
                            color: var(--color-icon-button-danger-text); {"}"}
                        </div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Alert Error Variant (alert.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Error alerts use --color-alert-danger for the accent color and heading text.
                    </p>
                    <ErrorAlert>
                        <p>An error occurred while processing your request. Please try again.</p>
                    </ErrorAlert>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>--alert-color: var(--color-alert-danger);</div>
                        <div>border-left: 4px solid var(--alert-color);</div>
                        <div>color: var(--alert-color); {/* heading */}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Form Error Messages (form.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Form validation errors use --color-form-error-text to display error messages
                        in a consistent, attention-grabbing color.
                    </p>
                    <div
                        style={{
                            padding: "1.5rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                        }}
                    >
                        <FormGroup>
                            <TextInputField
                                label="Email Address"
                                value=""
                                error="This field is required"
                            />
                        </FormGroup>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>.error-message {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            color: var(--color-form-error-text);
                        </div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <InlineInputInvalidSection />

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Invalid Cell Background (fixed_table_editor.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Table cells with invalid data use --color-form-invalid-bg to highlight the
                        error state.
                    </p>
                    <div
                        style={{
                            padding: "1.5rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                        }}
                    >
                        <table
                            style={{
                                "border-collapse": "collapse",
                                width: "100%",
                            }}
                        >
                            <thead>
                                <tr>
                                    <th
                                        style={{
                                            border: "1px solid var(--color-gray-400)",
                                            padding: "0.5rem",
                                            "text-align": "left",
                                        }}
                                    >
                                        Name
                                    </th>
                                    <th
                                        style={{
                                            border: "1px solid var(--color-gray-400)",
                                            padding: "0.5rem",
                                            "text-align": "left",
                                        }}
                                    >
                                        Value
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td
                                        style={{
                                            border: "1px solid var(--color-gray-400)",
                                            padding: "0.5rem",
                                        }}
                                    >
                                        Valid
                                    </td>
                                    <td
                                        style={{
                                            border: "1px solid var(--color-gray-400)",
                                            padding: "0.5rem",
                                        }}
                                    >
                                        42
                                    </td>
                                </tr>
                                <tr>
                                    <td
                                        style={{
                                            border: "1px solid var(--color-gray-400)",
                                            padding: "0.5rem",
                                        }}
                                    >
                                        Invalid
                                    </td>
                                    <td
                                        style={{
                                            border: "1px solid var(--color-gray-400)",
                                            padding: "0.5rem",
                                            background: "var(--color-form-invalid-bg)",
                                        }}
                                    >
                                        abc
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>.cell.invalid {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            background: var(--color-form-invalid-bg);
                        </div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Danger Color Variables Overview
                    </h2>
                    <div
                        style={{
                            display: "grid",
                            "grid-template-columns": "repeat(auto-fill, minmax(250px, 1fr))",
                            gap: "1.5rem",
                        }}
                    >
                        <ColorSwatch value="--color-icon-button-danger-hover" />
                        <ColorSwatch value="--color-form-invalid-bg" />
                        <ColorSwatch value="--color-button-danger-hover" />
                        <ColorSwatch value="--color-button-danger-base" />
                        <ColorSwatch value="--color-inline-input-danger" />
                        <ColorSwatch value="--color-icon-button-danger-text" />
                        <ColorSwatch value="--color-form-error-text" />
                        <ColorSwatch value="--color-alert-danger" />
                    </div>
                </div>
            </div>
        );
    },
};

export const WarningColorUsage: Story = {
    render() {
        return (
            <div style={{ padding: "2rem", "max-width": "1400px", margin: "0 auto" }}>
                <h1 style={{ "margin-bottom": "2rem", "font-size": "2rem", "font-weight": "700" }}>
                    Warning Color Usage Examples
                </h1>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Warning Banner (warning_banner.module.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Warning banners use --color-warning-banner-bg for background,
                        --color-warning-banner-border for border, and --color-warning-banner-text
                        for text color.
                    </p>
                    <WarningBanner>
                        This is a warning message. Please review the action before proceeding.
                    </WarningBanner>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>background-color: var(--color-warning-banner-bg);</div>
                        <div>border: 1px solid var(--color-warning-banner-border);</div>
                        <div>color: var(--color-warning-banner-text);</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Alert Warning Variant (alert.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Warning alerts use --color-alert-warning for the accent color and heading
                        text.
                    </p>
                    <Warning>
                        <p>Please review this action carefully before proceeding.</p>
                    </Warning>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>--alert-color: var(--color-alert-warning);</div>
                        <div>border-left: 4px solid var(--alert-color);</div>
                        <div>color: var(--alert-color); {/* heading */}</div>
                    </div>
                </div>

                <InlineInputIncompleteSection />

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Warning Color Variables Overview
                    </h2>
                    <div
                        style={{
                            display: "grid",
                            "grid-template-columns": "repeat(auto-fill, minmax(250px, 1fr))",
                            gap: "1.5rem",
                        }}
                    >
                        <ColorSwatch value="--color-warning-banner-bg" />
                        <ColorSwatch value="--color-warning-banner-border" />
                        <ColorSwatch value="--color-inline-input-warning" />
                        <ColorSwatch value="--color-alert-warning" />
                        <ColorSwatch value="--color-warning-banner-text" />
                    </div>
                </div>
            </div>
        );
    },
};

export const InformationColorUsage: Story = {
    render() {
        return (
            <div style={{ padding: "2rem", "max-width": "1400px", margin: "0 auto" }}>
                <h1 style={{ "margin-bottom": "2rem", "font-size": "2rem", "font-weight": "700" }}>
                    Information Color Usage Examples
                </h1>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Alert Question Variant (alert.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Question alerts use --color-alert-question (cornflowerblue) for the accent
                        color and heading text.
                    </p>
                    <Question>
                        <p>
                            Did you know that you can use keyboard shortcuts to speed up your
                            workflow?
                        </p>
                    </Question>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>--alert-color: var(--color-alert-question);</div>
                        <div>border-left: 4px solid var(--alert-color);</div>
                        <div>color: var(--alert-color); {/* heading */}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Alert Note Variant (alert.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Note alerts use --color-alert-note (teal) for the accent color and heading
                        text.
                    </p>
                    <Note>
                        <p>
                            This is important information to keep in mind while working on this
                            task.
                        </p>
                    </Note>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>--alert-color: var(--color-alert-note);</div>
                        <div>border-left: 4px solid var(--alert-color);</div>
                        <div>color: var(--alert-color); {/* heading */}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Information Color Variables Overview
                    </h2>
                    <div
                        style={{
                            display: "grid",
                            "grid-template-columns": "repeat(auto-fill, minmax(250px, 1fr))",
                            gap: "1.5rem",
                        }}
                    >
                        <ColorSwatch value="--color-alert-question" />
                        <ColorSwatch value="--color-alert-note" />
                    </div>
                </div>
            </div>
        );
    },
};

export const SelectionFocusHighlightUsage: Story = {
    render() {
        return (
            <div style={{ padding: "2rem", "max-width": "1400px", margin: "0 auto" }}>
                <h1 style={{ "margin-bottom": "2rem", "font-size": "2rem", "font-weight": "700" }}>
                    Selection, Focus & Highlight Usage Examples
                </h1>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Hover Background
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-text-secondary)" }}>
                        Used for hover states on interactive elements like sidebar items, table
                        rows, and list items. Provides subtle visual feedback when hovering.
                    </p>
                    <div
                        style={{
                            padding: "1.5rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                        }}
                    >
                        <div style={{ display: "flex", "flex-direction": "column", gap: "0.5rem" }}>
                            <div
                                style={{
                                    padding: "0.75rem",
                                    "border-radius": "4px",
                                    transition: "background 0.2s",
                                    cursor: "pointer",
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = "var(--color-hover-bg)";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "transparent";
                                }}
                            >
                                Sidebar Item (hover me)
                            </div>
                            <div
                                style={{
                                    padding: "0.75rem",
                                    "border-radius": "4px",
                                    transition: "background 0.2s",
                                    cursor: "pointer",
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = "var(--color-hover-bg)";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "transparent";
                                }}
                            >
                                Table Row (hover me)
                            </div>
                            <div
                                style={{
                                    padding: "0.75rem",
                                    "border-radius": "4px",
                                    transition: "background 0.2s",
                                    cursor: "pointer",
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = "var(--color-hover-bg)";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "transparent";
                                }}
                            >
                                List Item (hover me)
                            </div>
                        </div>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>&:hover {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            background: var(--color-hover-bg);
                        </div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Notebook Cell Drop Indicator (notebook_cell.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        The drop indicator in notebook cells uses --color-dnd-insert for both the
                        gradient line and the indicator dot to show where a cell will be dropped.
                    </p>
                    <div
                        style={{
                            padding: "2rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                        }}
                    >
                        <div style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                            Drop indicator appearance:
                        </div>
                        <div
                            style={{
                                height: "2px",
                                "border-radius": "1px",
                                margin: "5px 0",
                                position: "relative",
                                background:
                                    "linear-gradient(270deg, transparent 0, var(--color-dnd-insert) 100%)",
                            }}
                        >
                            <div
                                style={{
                                    position: "absolute",
                                    width: "6px",
                                    height: "6px",
                                    "background-color": "var(--color-dnd-insert)",
                                    top: "-2px",
                                }}
                            />
                        </div>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>
                            background: linear-gradient(270deg, transparent 0,
                            var(--color-dnd-insert) 100%);
                        </div>
                        <div>
                            &::before {"{"} background-color: var(--color-dnd-insert); {"}"}
                        </div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Completion List Active Item (completions.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Active completion items use --color-highlight-bg to indicate keyboard or
                        hover selection.
                    </p>
                    <div
                        style={{
                            padding: "1rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                        }}
                    >
                        <ul style={{ "list-style": "none", padding: "0", margin: "0" }}>
                            <li
                                style={{
                                    padding: "5px",
                                    cursor: "pointer",
                                    "border-radius": "4px",
                                }}
                            >
                                Normal completion item
                            </li>
                            <li
                                style={{
                                    padding: "5px",
                                    cursor: "pointer",
                                    background: "var(--color-highlight-bg)",
                                    "border-radius": "4px",
                                }}
                            >
                                Active completion item
                            </li>
                            <li
                                style={{
                                    padding: "5px",
                                    cursor: "pointer",
                                    "border-radius": "4px",
                                }}
                            >
                                Normal completion item
                            </li>
                        </ul>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>.completion-list li.active {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            background: var(--color-highlight-bg);
                        </div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Menu Item Highlight (menubar.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Menu items use --color-highlight-bg when highlighted (keyboard navigation or
                        hover).
                    </p>
                    <div
                        style={{
                            padding: "1rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                "flex-direction": "column",
                                gap: "0.25rem",
                            }}
                        >
                            <div
                                role="menuitem"
                                style={{
                                    padding: "0.5ex",
                                    cursor: "pointer",
                                    "border-radius": "4px",
                                }}
                            >
                                File
                            </div>
                            <div
                                role="menuitem"
                                style={{
                                    padding: "0.5ex",
                                    cursor: "pointer",
                                    background: "var(--color-highlight-bg)",
                                    "border-radius": "4px",
                                }}
                            >
                                Edit (highlighted)
                            </div>
                            <div
                                role="menuitem"
                                style={{
                                    padding: "0.5ex",
                                    cursor: "pointer",
                                    "border-radius": "4px",
                                }}
                            >
                                View
                            </div>
                        </div>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>&[data-highlighted] {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            background: var(--color-highlight-bg);
                        </div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Text Selection (rich_text_editor.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Selected text in the rich text editor uses --color-rich-text-selection-bg
                        for highlighting.
                    </p>
                    <div
                        style={{
                            padding: "1rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                        }}
                    >
                        <div style={{ padding: "0.5rem" }}>
                            This is some text with{" "}
                            <span style={{ background: "var(--color-rich-text-selection-bg)" }}>
                                selected content
                            </span>{" "}
                            in the editor.
                        </div>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>.is-selected {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            background-color: var(--color-rich-text-selection-bg);
                        </div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Link Editor Focus (link_editor.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        The link editor uses --color-link-editor-focus for the focus ring to
                        indicate active editing state.
                    </p>
                    <div
                        style={{
                            display: "flex",
                            "justify-content": "center",
                            padding: "2rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                        }}
                    >
                        <input
                            type="text"
                            value="https://example.com"
                            style={{
                                padding: "0.5rem",
                                border: "2px solid var(--color-link-editor-focus)",
                                "border-radius": "4px",
                                outline: "none",
                                width: "300px",
                            }}
                            readonly
                        />
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>&:focus {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            border-color: var(--color-link-editor-focus);
                        </div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Anonymous ID Input (id_input.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Anonymous ID inputs use --color-id-input-anonymous-base as a background
                        color to distinguish them from named inputs.
                    </p>
                    <div
                        style={{
                            display: "flex",
                            "justify-content": "center",
                            padding: "2rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                            gap: "1rem",
                        }}
                    >
                        <div style={{ display: "flex", "flex-direction": "column", gap: "0.5rem" }}>
                            <label
                                style={{
                                    "font-size": "0.875rem",
                                    color: "var(--color-gray-800)",
                                }}
                            >
                                Named Input:
                            </label>
                            <input
                                type="text"
                                value="MyObject"
                                style={{
                                    padding: "0.5rem",
                                    border: "1px solid var(--color-gray-400)",
                                    "border-radius": "4px",
                                    background: "var(--color-background)",
                                }}
                                readonly
                            />
                        </div>
                        <div style={{ display: "flex", "flex-direction": "column", gap: "0.5rem" }}>
                            <label
                                style={{
                                    "font-size": "0.875rem",
                                    color: "var(--color-gray-800)",
                                }}
                            >
                                Anonymous Input:
                            </label>
                            <input
                                type="text"
                                value="_anon_123"
                                style={{
                                    padding: "0.5rem",
                                    border: "1px solid var(--color-gray-400)",
                                    "border-radius": "4px",
                                    background: "var(--color-id-input-anonymous-base)",
                                }}
                                readonly
                            />
                        </div>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>&.anonymous {"{"}</div>
                        <div style={{ "padding-left": "1rem" }}>
                            background: var(--color-id-input-anonymous-base);
                        </div>
                        <div>{"}"}</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Selection & Highlight Color Variables Overview
                    </h2>
                    <div
                        style={{
                            display: "grid",
                            "grid-template-columns": "repeat(auto-fill, minmax(250px, 1fr))",
                            gap: "1.5rem",
                        }}
                    >
                        <ColorSwatch value="--color-hover-bg" />
                        <ColorSwatch value="--color-dnd-insert" />
                        <ColorSwatch value="--color-highlight-bg" />
                        <ColorSwatch value="--color-rich-text-selection-bg" />
                        <ColorSwatch value="--color-link-editor-focus" />
                        <ColorSwatch value="--color-id-input-anonymous-base" />
                    </div>
                </div>
            </div>
        );
    },
};

export const BordersAndSeparatorsUsage: Story = {
    render() {
        return (
            <div style={{ padding: "2rem", "max-width": "1400px", margin: "0 auto" }}>
                <h1 style={{ "margin-bottom": "2rem", "font-size": "2rem", "font-weight": "700" }}>
                    Borders & Separators Usage Examples
                </h1>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Help Border (help.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Help elements use --color-help-border for a semi-transparent border that
                        provides subtle visual containment.
                    </p>
                    <div
                        style={{
                            padding: "1rem",
                            background: "var(--color-background)",
                            border: "1px solid var(--color-help-border)",
                            "border-radius": "6px",
                        }}
                    >
                        <div style={{ "font-weight": "600", "margin-bottom": "0.5rem" }}>
                            Help Content
                        </div>
                        <div style={{ color: "var(--color-gray-800)" }}>
                            This help section uses --color-help-border for its outline.
                        </div>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>border: 1px solid var(--color-help-border);</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Menu Separator (menubar.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Menu separators use --color-menu-separator to create visual divisions
                        between menu groups.
                    </p>
                    <div
                        style={{
                            padding: "1rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                            "min-width": "200px",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                "flex-direction": "column",
                                gap: "0.5rem",
                            }}
                        >
                            <div
                                role="menuitem"
                                style={{
                                    padding: "0.5rem",
                                    cursor: "pointer",
                                }}
                            >
                                Cut
                            </div>
                            <div
                                role="menuitem"
                                style={{
                                    padding: "0.5rem",
                                    cursor: "pointer",
                                }}
                            >
                                Copy
                            </div>
                            <div
                                role="menuitem"
                                style={{
                                    padding: "0.5rem",
                                    cursor: "pointer",
                                }}
                            >
                                Paste
                            </div>
                            <div
                                role="separator"
                                style={{
                                    height: "1px",
                                    background: "var(--color-menu-separator)",
                                    margin: "0.25rem 0",
                                }}
                            />
                            <div
                                role="menuitem"
                                style={{
                                    padding: "0.5rem",
                                    cursor: "pointer",
                                }}
                            >
                                Select All
                            </div>
                        </div>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>background: var(--color-menu-separator);</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Borders & Separators Color Variables Overview
                    </h2>
                    <div
                        style={{
                            display: "grid",
                            "grid-template-columns": "repeat(auto-fill, minmax(250px, 1fr))",
                            gap: "1.5rem",
                        }}
                    >
                        <ColorSwatch value="--color-help-border" />
                        <ColorSwatch value="--color-menu-separator" />
                    </div>
                </div>
            </div>
        );
    },
};

export const OverlaysAndShadowsUsage: Story = {
    render() {
        return (
            <div style={{ padding: "2rem", "max-width": "1400px", margin: "0 auto" }}>
                <h1 style={{ "margin-bottom": "2rem", "font-size": "2rem", "font-weight": "700" }}>
                    Overlays & Shadows Usage Examples
                </h1>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Popup Shadow (global.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Popup elements use a layered shadow effect combining --color-shadow-base,
                        --color-shadow-medium, and --color-shadow-strong to create depth.
                    </p>
                    <div
                        style={{
                            display: "flex",
                            "justify-content": "center",
                            padding: "3rem",
                            background: "var(--color-gray-100)",
                            "border-radius": "6px",
                        }}
                    >
                        <div
                            style={{
                                background: "var(--color-background)",
                                padding: "1.5rem",
                                border: "solid var(--color-gray-450) 1px",
                                "border-radius": "6px",
                                "box-shadow":
                                    "var(--color-shadow-base) 0px 0px 0px 1px, var(--color-shadow-medium) 0px 3px 6px, var(--color-shadow-strong) 0px 9px 24px",
                                "min-width": "200px",
                            }}
                        >
                            <div style={{ "font-weight": "600", "margin-bottom": "0.5rem" }}>
                                Popup Element
                            </div>
                            <div style={{ color: "var(--color-gray-800)" }}>
                                This demonstrates the layered shadow effect used on popups and
                                dropdowns.
                            </div>
                        </div>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>box-shadow:</div>
                        <div style={{ "padding-left": "1rem" }}>
                            var(--color-shadow-base) 0px 0px 0px 1px,
                        </div>
                        <div style={{ "padding-left": "1rem" }}>
                            var(--color-shadow-medium) 0px 3px 6px,
                        </div>
                        <div style={{ "padding-left": "1rem" }}>
                            var(--color-shadow-strong) 0px 9px 24px;
                        </div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Overlay Background (global.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Overlays use --color-overlay-base to create a semi-transparent background
                        that dims content behind modals and dialogs.
                    </p>
                    <div
                        style={{
                            position: "relative",
                            height: "200px",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                            overflow: "hidden",
                        }}
                    >
                        <div
                            style={{
                                padding: "1rem",
                                color: "var(--color-gray-800)",
                            }}
                        >
                            <div style={{ "font-weight": "600", "margin-bottom": "0.5rem" }}>
                                Background Content
                            </div>
                            <div>This content is behind the overlay.</div>
                        </div>
                        <div
                            style={{
                                position: "absolute",
                                top: "0",
                                left: "0",
                                right: "0",
                                bottom: "0",
                                "background-color": "var(--color-overlay-base)",
                                display: "flex",
                                "align-items": "center",
                                "justify-content": "center",
                            }}
                        >
                            <div
                                style={{
                                    background: "var(--color-background)",
                                    padding: "1.5rem",
                                    "border-radius": "6px",
                                    "box-shadow":
                                        "var(--color-shadow-base) 0px 0px 0px 1px, var(--color-shadow-medium) 0px 3px 6px, var(--color-shadow-strong) 0px 9px 24px",
                                }}
                            >
                                Modal Content
                            </div>
                        </div>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>background-color: var(--color-overlay-base);</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Spinner (spinner.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Loading spinners use --color-overlay-light for the base circle, creating a
                        subtle track for the spinning indicator.
                    </p>
                    <div
                        style={{
                            display: "flex",
                            "justify-content": "center",
                            padding: "2rem",
                            background: "var(--color-background)",
                            "border-radius": "6px",
                            border: "1px solid var(--color-gray-400)",
                        }}
                    >
                        <div
                            style={{
                                border: "4px solid var(--color-overlay-light)",
                                "border-top-color": "var(--color-gray-900)",
                                "border-radius": "50%",
                                width: "40px",
                                height: "40px",
                                animation: "spin 1s linear infinite",
                            }}
                        />
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>border: 4px solid var(--color-overlay-light);</div>
                        <div>border-top-color: var(--color-gray-900);</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Tooltip (icon_button.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        Tooltips use --color-tooltip-bg for a dark semi-transparent background with
                        light text.
                    </p>
                    <div
                        style={{
                            display: "flex",
                            "justify-content": "center",
                            padding: "2rem",
                            background: "var(--color-gray-100)",
                            "border-radius": "6px",
                        }}
                    >
                        <div
                            style={{
                                "border-radius": "0.5rem",
                                color: "var(--color-background)",
                                "background-color": "var(--color-tooltip-bg)",
                                padding: "0.5rem 0.75rem",
                                "font-size": "0.875rem",
                            }}
                        >
                            Tooltip text appears here
                        </div>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>background-color: var(--color-tooltip-bg);</div>
                        <div>color: var(--color-background);</div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Link Editor Shadows (link_editor.css)
                    </h2>
                    <p style={{ "margin-bottom": "1rem", color: "var(--color-gray-800)" }}>
                        The link editor uses a custom shadow stack with three shadow layers for a
                        unique elevation effect.
                    </p>
                    <div
                        style={{
                            display: "flex",
                            "justify-content": "center",
                            padding: "3rem",
                            background: "var(--color-gray-100)",
                            "border-radius": "6px",
                        }}
                    >
                        <div
                            style={{
                                background: "var(--color-background)",
                                padding: "1rem",
                                "border-radius": "6px",
                                "box-shadow":
                                    "0 0 0 1px var(--color-link-editor-shadow-1), 0 2px 4px var(--color-link-editor-shadow-2), 0 12px 28px var(--color-link-editor-shadow-3)",
                                "min-width": "200px",
                            }}
                        >
                            Link Editor Element
                        </div>
                    </div>
                    <div
                        style={{
                            "margin-top": "1rem",
                            padding: "1rem",
                            background: "var(--color-gray-50)",
                            "border-radius": "6px",
                            "font-family": "var(--mono-font)",
                            "font-size": "0.875rem",
                        }}
                    >
                        <div>box-shadow:</div>
                        <div style={{ "padding-left": "1rem" }}>
                            0 0 0 1px var(--color-link-editor-shadow-1),
                        </div>
                        <div style={{ "padding-left": "1rem" }}>
                            0 2px 4px var(--color-link-editor-shadow-2),
                        </div>
                        <div style={{ "padding-left": "1rem" }}>
                            0 12px 28px var(--color-link-editor-shadow-3);
                        </div>
                    </div>
                </div>

                <div style={{ "margin-bottom": "3rem" }}>
                    <h2
                        style={{
                            "margin-bottom": "1rem",
                            "font-size": "1.25rem",
                            "font-weight": "600",
                        }}
                    >
                        Overlays & Shadows Color Variables Overview
                    </h2>
                    <div
                        style={{
                            display: "grid",
                            "grid-template-columns": "repeat(auto-fill, minmax(250px, 1fr))",
                            gap: "1.5rem",
                        }}
                    >
                        <ColorSwatch value="--color-overlay-base" />
                        <ColorSwatch value="--color-overlay-light" />
                        <ColorSwatch value="--color-shadow-base" />
                        <ColorSwatch value="--color-shadow-medium" />
                        <ColorSwatch value="--color-shadow-strong" />
                        <ColorSwatch value="--color-tooltip-bg" />
                        <ColorSwatch value="--color-link-editor-shadow-1" />
                        <ColorSwatch value="--color-link-editor-shadow-2" />
                        <ColorSwatch value="--color-link-editor-shadow-3" />
                    </div>
                </div>
            </div>
        );
    },
};
