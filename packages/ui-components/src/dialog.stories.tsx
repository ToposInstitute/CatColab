import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { Button } from "./button";
import { Dialog } from "./dialog";

const meta = {
    title: "Messages/Dialog",
    component: Dialog,
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Summary: Story = {
    render: () => {
        const [open, setOpen] = createSignal(false);
        return (
            <div>
                <Button onClick={() => setOpen(true)}>Open Dialog</Button>
                <Dialog open={open()} onOpenChange={setOpen} title="Example Dialog">
                    <p>This is a dialog component. It overlays content on top of the page.</p>
                    <p>Click the X button or outside the dialog to close it.</p>
                </Dialog>
            </div>
        );
    },
    tags: ["!autodocs", "!dev"],
};

export const Basic: Story = {
    render: () => {
        const [open, setOpen] = createSignal(false);
        return (
            <div>
                <Button onClick={() => setOpen(true)}>Open Basic Dialog</Button>
                <Dialog open={open()} onOpenChange={setOpen} title="Basic Dialog">
                    <p>This is a basic dialog with a title and content.</p>
                </Dialog>
            </div>
        );
    },
};

export const WithForm: Story = {
    render: () => {
        const [open, setOpen] = createSignal(false);
        const [name, setName] = createSignal("");

        const handleSubmit = (e: Event) => {
            e.preventDefault();
            setOpen(false);
            setName("");
        };

        return (
            <div>
                <Button onClick={() => setOpen(true)}>Open Form Dialog</Button>
                <Dialog open={open()} onOpenChange={setOpen} title="Enter Your Name">
                    <form onSubmit={handleSubmit} style={{ padding: "16px" }}>
                        <div style={{ "margin-bottom": "12px" }}>
                            <label for="name-input">
                                Name:
                                <input
                                    id="name-input"
                                    type="text"
                                    value={name()}
                                    onInput={(e) => setName(e.currentTarget.value)}
                                    style={{ "margin-left": "8px" }}
                                />
                            </label>
                        </div>
                        <Button type="submit">Submit</Button>
                    </form>
                </Dialog>
            </div>
        );
    },
};

export const ConfirmationDialog: Story = {
    render: () => {
        const [open, setOpen] = createSignal(false);

        const handleDelete = () => {
            setOpen(false);
        };

        return (
            <div>
                <Button variant="danger" onClick={() => setOpen(true)}>
                    Delete Item
                </Button>
                <Dialog open={open()} onOpenChange={setOpen} title="Delete Document">
                    <div style={{ padding: "16px" }}>
                        <p>Are you sure you want to delete this document?</p>
                        <p>This action cannot be undone.</p>
                        <div style={{ "margin-top": "16px", display: "flex", gap: "8px" }}>
                            <Button variant="danger" onClick={handleDelete}>
                                Delete
                            </Button>
                            <Button variant="utility" onClick={() => setOpen(false)}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                </Dialog>
            </div>
        );
    },
};

export const WithoutTitle: Story = {
    render: () => {
        const [open, setOpen] = createSignal(false);
        return (
            <div>
                <Button onClick={() => setOpen(true)}>Open Dialog Without Title</Button>
                <Dialog open={open()} onOpenChange={setOpen}>
                    <div style={{ padding: "16px" }}>
                        <p>This dialog has no title.</p>
                    </div>
                </Dialog>
            </div>
        );
    },
};
