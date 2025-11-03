import Resizable from "@corvu/resizable";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { ResizableHandle } from "./resizable";

const meta = {
    title: "ResizableHandle",
    component: ResizableHandle,
} satisfies Meta<typeof ResizableHandle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Summary: Story = {
    render: () => (
        <Resizable
            orientation="horizontal"
            style={{
                display: "flex",
                height: "300px",
                border: "1px solid #ccc",
                "border-radius": "4px",
                overflow: "hidden",
            }}
        >
            <Resizable.Panel
                initialSize={0.5}
                minSize={0.2}
                style={{
                    padding: "16px",
                    background: "#f0f0f0",
                }}
            >
                <h3>Left Panel</h3>
                <p>Drag the handle to resize.</p>
            </Resizable.Panel>
            <ResizableHandle />
            <Resizable.Panel
                initialSize={0.5}
                minSize={0.2}
                style={{
                    padding: "16px",
                    background: "#e8e8e8",
                }}
            >
                <h3>Right Panel</h3>
                <p>This panel resizes too.</p>
            </Resizable.Panel>
        </Resizable>
    ),
    tags: ["!autodocs", "!dev"],
};

export const HorizontalPanels: Story = {
    render: () => (
        <Resizable
            orientation="horizontal"
            style={{ display: "flex", height: "250px", border: "1px solid #ccc" }}
        >
            <Resizable.Panel
                initialSize={0.5}
                minSize={0.2}
                style={{ padding: "16px", background: "#f5f5f5" }}
            >
                <p>Left panel content</p>
            </Resizable.Panel>
            <ResizableHandle />
            <Resizable.Panel
                initialSize={0.5}
                minSize={0.2}
                style={{ padding: "16px", background: "#eaeaea" }}
            >
                <p>Right panel content</p>
            </Resizable.Panel>
        </Resizable>
    ),
};

export const VerticalPanels: Story = {
    render: () => (
        <Resizable
            orientation="vertical"
            style={{
                display: "flex",
                "flex-direction": "column",
                height: "400px",
                border: "1px solid #ccc",
            }}
        >
            <Resizable.Panel
                initialSize={0.5}
                minSize={0.2}
                style={{ padding: "16px", background: "#f5f5f5" }}
            >
                <p>Top panel content</p>
            </Resizable.Panel>
            <ResizableHandle />
            <Resizable.Panel
                initialSize={0.5}
                minSize={0.2}
                style={{ padding: "16px", background: "#eaeaea" }}
            >
                <p>Bottom panel content</p>
            </Resizable.Panel>
        </Resizable>
    ),
};

export const ThreePanels: Story = {
    render: () => (
        <Resizable
            orientation="horizontal"
            style={{ display: "flex", height: "300px", border: "1px solid #ccc" }}
        >
            <Resizable.Panel
                initialSize={0.33}
                minSize={0.15}
                style={{ padding: "16px", background: "#f5f5f5" }}
            >
                <h4>Panel 1</h4>
                <p>First panel</p>
            </Resizable.Panel>
            <ResizableHandle />
            <Resizable.Panel
                initialSize={0.34}
                minSize={0.15}
                style={{ padding: "16px", background: "#e8e8e8" }}
            >
                <h4>Panel 2</h4>
                <p>Middle panel</p>
            </Resizable.Panel>
            <ResizableHandle />
            <Resizable.Panel
                initialSize={0.33}
                minSize={0.15}
                style={{ padding: "16px", background: "#dcdcdc" }}
            >
                <h4>Panel 3</h4>
                <p>Last panel</p>
            </Resizable.Panel>
        </Resizable>
    ),
};

export const WithDifferentInitialSizes: Story = {
    render: () => (
        <Resizable
            orientation="horizontal"
            style={{ display: "flex", height: "250px", border: "1px solid #ccc" }}
        >
            <Resizable.Panel
                initialSize={0.3}
                minSize={0.2}
                style={{ padding: "16px", background: "#f5f5f5" }}
            >
                <p>Smaller panel (30%)</p>
            </Resizable.Panel>
            <ResizableHandle />
            <Resizable.Panel
                initialSize={0.7}
                minSize={0.2}
                style={{ padding: "16px", background: "#eaeaea" }}
            >
                <p>Larger panel (70%)</p>
            </Resizable.Panel>
        </Resizable>
    ),
};

export const WithMinimumSizes: Story = {
    render: () => (
        <Resizable
            orientation="horizontal"
            style={{ display: "flex", height: "250px", border: "1px solid #ccc" }}
        >
            <Resizable.Panel
                initialSize={0.5}
                minSize={0.3}
                style={{ padding: "16px", background: "#f5f5f5" }}
            >
                <p>Min size: 30%</p>
                <p>Try resizing - it won't go below 30%.</p>
            </Resizable.Panel>
            <ResizableHandle />
            <Resizable.Panel
                initialSize={0.5}
                minSize={0.3}
                style={{ padding: "16px", background: "#eaeaea" }}
            >
                <p>Min size: 30%</p>
                <p>This panel also has a minimum size.</p>
            </Resizable.Panel>
        </Resizable>
    ),
};

export const NestedResizablePanels: Story = {
    render: () => (
        <Resizable
            orientation="horizontal"
            style={{ display: "flex", height: "400px", border: "1px solid #ccc" }}
        >
            <Resizable.Panel
                initialSize={0.5}
                minSize={0.2}
                style={{ padding: "16px", background: "#f5f5f5" }}
            >
                <h4>Left Panel</h4>
                <p>Fixed content on the left</p>
            </Resizable.Panel>
            <ResizableHandle />
            <Resizable.Panel initialSize={0.5} minSize={0.2}>
                <Resizable
                    orientation="vertical"
                    style={{ display: "flex", "flex-direction": "column", height: "100%" }}
                >
                    <Resizable.Panel
                        initialSize={0.5}
                        minSize={0.2}
                        style={{ padding: "16px", background: "#e8e8e8" }}
                    >
                        <h4>Top Right</h4>
                        <p>Nested top panel</p>
                    </Resizable.Panel>
                    <ResizableHandle />
                    <Resizable.Panel
                        initialSize={0.5}
                        minSize={0.2}
                        style={{ padding: "16px", background: "#dcdcdc" }}
                    >
                        <h4>Bottom Right</h4>
                        <p>Nested bottom panel</p>
                    </Resizable.Panel>
                </Resizable>
            </Resizable.Panel>
        </Resizable>
    ),
};
