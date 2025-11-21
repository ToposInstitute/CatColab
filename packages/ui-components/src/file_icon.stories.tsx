import { File } from "lucide-solid";
import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { FileIcon, theoryToLetterMap } from "./file_icon";

const meta = {
    title: "Icons/FileIcon",
    component: FileIcon,
} satisfies Meta<typeof FileIcon>;

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
                        <FileIcon theory={modelType} />
                        {modelType}
                    </div>
                )}
            </For>
            <div>
                <FileIcon theory="unknown" />
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
                    <FileIcon theory={modelType} size={16} />
                    <FileIcon theory={modelType} size={20} />
                    <FileIcon theory={modelType} size={24} />
                    <FileIcon theory={modelType} size={32} />
                    <FileIcon theory={modelType} size={48} />
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
                    <FileIcon size={32} theory="simple-olog" color={color} />
                    <FileIcon size={32} theory="simple-schema" color={color} />
                    <FileIcon size={32} theory="petri-net" color={color} />
                    <FileIcon size={32} theory="causal-loop" color={color} />
                    <FileIcon size={32} theory="causal-loop-delays" color={color} />
                    <FileIcon size={32} theory="indeterminate-causal-loop" color={color} />
                    <FileIcon size={32} theory="primitive-stock-flow" color={color} />
                    <FileIcon size={32} theory="reg-net" color={color} />
                    <FileIcon size={32} theory="unary-dec" color={color} />
                    <FileIcon size={32} theory="power-system" color={color} />
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
                    {(modelType) => <FileIcon theory={modelType} />}
                </For>
                <FileIcon theory="unknown" />
            </div>
            <div>
                <For each={Object.keys(theoryToLetterMap)}>{(_) => <File />}</For>
                <File />
            </div>
        </div>
    ),
};
