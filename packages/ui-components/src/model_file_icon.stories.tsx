import { File } from "lucide-solid";
import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { ModelFileIcon } from "./model_file_icon";

const theoryToLetterMap: Record<string, [string, string]> = {
    empty: ["I", "n"],
    "simple-olog": ["O", "l"],
    "simple-schema": ["S", "c"],
    "petri-net": ["P", "n"],
    "causal-loop": ["C", "l"],
    "causal-loop-delays": ["C", "d"],
    "indeterminate-causal-loop": ["C", "i"],
    "primitive-stock-flow": ["S", "f"],
    "reg-net": ["R", "n"],
    "unary-dec": ["D", "c"],
    "power-system": ["P", "s"],
};

const meta = {
    title: "Icons/_internal/ModelFileIcon",
    component: ModelFileIcon,
} satisfies Meta<typeof ModelFileIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Summary: Story = {
    render: () => <div style={{ display: "flex", gap: "8px", "align-items": "center" }}></div>,
    tags: ["!autodocs", "!dev"],
};

export const AllIcons: Story = {
    render: () => (
        <>
            <For each={Object.entries(theoryToLetterMap)}>
                {([modelType, letters]) => (
                    <div>
                        <ModelFileIcon letters={letters} />
                        {modelType}
                    </div>
                )}
            </For>
            <div>
                <ModelFileIcon letters={["?", "?"]} />
                unknown
            </div>
        </>
    ),
};

export const DifferentSizes: Story = {
    render: () => (
        <For each={Object.values(theoryToLetterMap)}>
            {(letters) => (
                <div style={{ display: "flex", gap: "16px", "align-items": "center" }}>
                    <ModelFileIcon letters={letters} size={16} />
                    <ModelFileIcon letters={letters} size={20} />
                    <ModelFileIcon letters={letters} size={24} />
                    <ModelFileIcon letters={letters} size={32} />
                    <ModelFileIcon letters={letters} size={48} />
                </div>
            )}
        </For>
    ),
};

export const DifferentColors: Story = {
    render: () => (
        <For each={["#000", "#fff", "#f00", "#0f0", "#00f"]}>
            {(color) => (
                <div
                    style={{
                        display: "flex",
                        gap: "16px",
                        "align-items": "center",
                        background: color === "#fff" ? "black" : "white",
                    }}
                >
                    <ModelFileIcon
                        size={32}
                        letters={theoryToLetterMap["simple-olog"]}
                        color={color}
                    />
                    <ModelFileIcon
                        size={32}
                        letters={theoryToLetterMap["simple-schema"]}
                        color={color}
                    />
                    <ModelFileIcon
                        size={32}
                        letters={theoryToLetterMap["petri-net"]}
                        color={color}
                    />
                    <ModelFileIcon
                        size={32}
                        letters={theoryToLetterMap["causal-loop"]}
                        color={color}
                    />
                    <ModelFileIcon
                        size={32}
                        letters={theoryToLetterMap["causal-loop-delays"]}
                        color={color}
                    />
                    <ModelFileIcon
                        size={32}
                        letters={theoryToLetterMap["indeterminate-causal-loop"]}
                        color={color}
                    />
                    <ModelFileIcon
                        size={32}
                        letters={theoryToLetterMap["primitive-stock-flow"]}
                        color={color}
                    />
                    <ModelFileIcon size={32} letters={theoryToLetterMap["reg-net"]} color={color} />
                    <ModelFileIcon
                        size={32}
                        letters={theoryToLetterMap["unary-dec"]}
                        color={color}
                    />
                    <ModelFileIcon
                        size={32}
                        letters={theoryToLetterMap["power-system"]}
                        color={color}
                    />
                </div>
            )}
        </For>
    ),
};

export const ComparedToLucide: Story = {
    render: () => (
        <div>
            <div>
                <For each={Object.values(theoryToLetterMap)}>
                    {(letters) => <ModelFileIcon letters={letters} />}
                </For>
                <ModelFileIcon letters={[" ", " "]} />
            </div>
            <div>
                <For each={Object.keys(theoryToLetterMap)}>{(_) => <File />}</For>
                <File />
            </div>
        </div>
    ),
};
