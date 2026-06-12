import { createSignal, splitProps } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { InlineInput } from "./inline_input";
import { InlineListEditor, type InlineListItemOptions } from "./inline_list_editor";
import { rootFocus, useChildFocus } from "./util/focus";

const meta = {
    title: "Forms & Inputs/InlineListEditor",
    component: InlineListEditor,
} satisfies Meta<typeof InlineListEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Item input for a list of plain strings. */
function StringItemInput(
    allProps: {
        item: string | null;
        setItem: (item: string | null) => void;
    } & InlineListItemOptions,
) {
    const [props, inputOptions] = splitProps(allProps, ["item", "setItem", "onTextChange"]);

    const setText = (text: string) => {
        props.onTextChange(text);
        props.setItem(text === "" ? null : text);
    };

    return (
        <InlineInput text={props.item ?? ""} setText={setText} placeholder="…" {...inputOptions} />
    );
}

export const Summary: Story = {
    render: () => {
        const [items, setItems] = createSignal<Array<string | null>>(["alice", "bob"]);
        const focus = useChildFocus<"list" | "outside">(rootFocus);

        return (
            <div style={{ padding: "16px" }}>
                <InlineListEditor
                    items={items()}
                    setItems={setItems}
                    focus={focus.childFocus("list")}
                >
                    {(item, setItem, options) => (
                        <StringItemInput item={item()} setItem={setItem} {...options} />
                    )}
                </InlineListEditor>
            </div>
        );
    },
    tags: ["!autodocs", "!dev"],
};

export const Basic: Story = {
    render: () => {
        const [items, setItems] = createSignal<Array<string | null>>(["alice", "bob"]);
        const focus = useChildFocus<"list" | "outside">(rootFocus);

        return (
            <div style={{ padding: "16px" }}>
                <p>
                    Press <kbd>,</kbd> to insert an item, <kbd>Backspace</kbd>/<kbd>Delete</kbd> in
                    an empty item to remove it, and arrow keys or <kbd>Home</kbd>/<kbd>End</kbd> to
                    navigate. Empty items are pruned when focus moves elsewhere.
                </p>
                <InlineListEditor
                    items={items()}
                    setItems={setItems}
                    focus={focus.childFocus("list")}
                >
                    {(item, setItem, options) => (
                        <StringItemInput item={item()} setItem={setItem} {...options} />
                    )}
                </InlineListEditor>
                <div style={{ "margin-top": "16px" }}>
                    <p>Focus here to deactivate the list:</p>
                    <InlineInput
                        text=""
                        setText={() => {}}
                        placeholder="Outside input"
                        focus={focus.childFocus("outside")}
                    />
                </div>
                <p style={{ "margin-top": "8px" }}>
                    Items: {JSON.stringify(items().map((item) => item ?? "·"))}
                </p>
            </div>
        );
    },
};

export const CustomDelimiters: Story = {
    render: () => {
        const [items, setItems] = createSignal<Array<string | null>>(["x", "y", "z"]);
        const focus = useChildFocus<"list" | "outside">(rootFocus);

        return (
            <div style={{ padding: "16px" }}>
                <p>
                    Tuple-style notation with parentheses, semicolon separators, and <kbd>;</kbd> as
                    the insert key:
                </p>
                <InlineListEditor
                    items={items()}
                    setItems={setItems}
                    focus={focus.childFocus("list")}
                    insertKey=";"
                    startDelimiter="("
                    endDelimiter=")"
                    separator={() => "; "}
                >
                    {(item, setItem, options) => (
                        <StringItemInput item={item()} setItem={setItem} {...options} />
                    )}
                </InlineListEditor>
                <div style={{ "margin-top": "16px" }}>
                    <InlineInput
                        text=""
                        setText={() => {}}
                        placeholder="Outside input"
                        focus={focus.childFocus("outside")}
                    />
                </div>
            </div>
        );
    },
};
