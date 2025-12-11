import { createSignal, Show } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { Button } from "./button";
import { Spinner } from "./spinner";

const meta = {
    title: "Loading/Spinner",
    component: Spinner,
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Summary: Story = {
    render: () => <Spinner />,
    tags: ["!autodocs", "!dev"],
};

export const LoadingState: Story = {
    render: () => {
        const [isLoading, setIsLoading] = createSignal(true);

        return (
            <div style={{ padding: "16px" }}>
                <Button
                    type="button"
                    onClick={() => setIsLoading(!isLoading())}
                    style={{ "margin-bottom": "16px" }}
                >
                    {isLoading() ? "Stop Loading" : "Start Loading"}
                </Button>
                <div
                    style={{
                        display: "flex",
                        "align-items": "center",
                        "justify-content": "center",
                        height: "200px",
                        border: "1px solid #ccc",
                        "border-radius": "4px",
                    }}
                >
                    <Show when={isLoading()} fallback={<p>Content loaded!</p>}>
                        <Spinner />
                    </Show>
                </div>
            </div>
        );
    },
};
