import { File } from "lucide-solid";
import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { ModelFileIcon, theoryToLetterMap } from "./model_file_icon";

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
            <For each={Object.keys(theoryToLetterMap)}>
                {(modelType) => (
                    <div>
                        <ModelFileIcon theory={modelType} />
                        {modelType}
                    </div>
                )}
            </For>
            <div>
                <ModelFileIcon theory="unknown" />
                unknown
            </div>
        </>
    ),
};

export const DifferentSizes: Story = {
    render: () => (
        <For each={Object.keys(theoryToLetterMap)}>
            {(modelType) => (
                <div style={{ display: "flex", gap: "16px", "align-items": "center" }}>
                    <ModelFileIcon theory={modelType} size={16} />
                    <ModelFileIcon theory={modelType} size={20} />
                    <ModelFileIcon theory={modelType} size={24} />
                    <ModelFileIcon theory={modelType} size={32} />
                    <ModelFileIcon theory={modelType} size={48} />
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
                    <ModelFileIcon size={32} theory="simple-olog" color={color} />
                    <ModelFileIcon size={32} theory="simple-schema" color={color} />
                    <ModelFileIcon size={32} theory="petri-net" color={color} />
                    <ModelFileIcon size={32} theory="causal-loop" color={color} />
                    <ModelFileIcon size={32} theory="causal-loop-delays" color={color} />
                    <ModelFileIcon size={32} theory="indeterminate-causal-loop" color={color} />
                    <ModelFileIcon size={32} theory="primitive-stock-flow" color={color} />
                    <ModelFileIcon size={32} theory="reg-net" color={color} />
                    <ModelFileIcon size={32} theory="unary-dec" color={color} />
                    <ModelFileIcon size={32} theory="power-system" color={color} />
                </div>
            )}
        </For>
    ),
};

export const ComparedToLucide: Story = {
    render: () => (
        <div>
            <div>
                <For each={Object.keys(theoryToLetterMap)}>
                    {(modelType) => <ModelFileIcon theory={modelType} />}
                </For>
                <ModelFileIcon theory="unknown" />
            </div>
            <div>
                <For each={Object.keys(theoryToLetterMap)}>{(_) => <File />}</For>
                <File />
            </div>
        </div>
    ),
};
