import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import Copy from "lucide-solid/icons/copy";
import Download from "lucide-solid/icons/download";
import Link2 from "lucide-solid/icons/link";
import SignInIcon from "lucide-solid/icons/log-in";
import Plus from "lucide-solid/icons/plus";
import Save from "lucide-solid/icons/save";
import SignUpIcon from "lucide-solid/icons/user-pen";
import X from "lucide-solid/icons/x";

import { Button } from "./button";

const meta = {
    title: "Buttons/Button",
    component: Button,
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Summary: Story = {
    render: () => (
        <div style={{ display: "flex", gap: "8px", "flex-wrap": "wrap" }}>
            <Button variant="primary">Primary</Button>
            <Button variant="utility">Utility</Button>
            <Button variant="danger">Danger</Button>
        </div>
    ),
    tags: ["!autodocs", "!dev"],
};

export const Primary: Story = {
    render: () => (
        <div style={{ display: "flex", gap: "8px", "flex-wrap": "wrap" }}>
            <Button variant="primary">Submit</Button>
            <Button variant="primary">
                <Save size={16} />
                Save
            </Button>
            <Button variant="primary" disabled>
                Disabled
            </Button>
        </div>
    ),
};

export const Utility: Story = {
    render: () => (
        <div style={{ display: "flex", gap: "8px", "flex-wrap": "wrap" }}>
            <Button variant="utility">Cancel</Button>
            <Button variant="utility">
                <Link2 size={16} />
                Copy link
            </Button>
            <Button variant="utility" disabled>
                Disabled
            </Button>
        </div>
    ),
};

export const UtilityWithIcons: Story = {
    render: () => (
        <div style={{ display: "flex", gap: "8px", "flex-wrap": "wrap" }}>
            <Button variant="utility">
                <Copy size={16} />
                Duplicate
            </Button>
            <Button variant="utility">
                <Download size={16} />
                Export
            </Button>
            <Button variant="utility" disabled>
                <Download size={16} />
                Export
            </Button>
        </div>
    ),
};

export const Danger: Story = {
    render: () => (
        <div style={{ display: "flex", gap: "8px", "flex-wrap": "wrap" }}>
            <Button variant="danger">Delete</Button>
            <Button variant="danger">
                <X size={16} />
                Delete
            </Button>
            <Button variant="danger" disabled>
                Delete
            </Button>
        </div>
    ),
};

export const WithIcons: Story = {
    render: () => (
        <div style={{ display: "flex", gap: "8px", "flex-wrap": "wrap" }}>
            <Button variant="primary">
                <Plus size={16} />
                Add New
            </Button>
            <Button variant="utility">
                <Save size={16} />
                Save Draft
            </Button>
            <Button variant="utility">
                <Link2 size={16} />
                Copy Link
            </Button>
            <Button variant="danger">
                <X size={16} />
                Delete
            </Button>
        </div>
    ),
};

export const LoginButtons: Story = {
    render: () => (
        <div style={{ display: "flex", gap: "8px", "flex-wrap": "wrap" }}>
            <Button variant="primary" type="submit" value="sign-in">
                <SignInIcon />
                Login
            </Button>
            <Button variant="primary" type="submit" value="sign-up">
                <SignUpIcon />
                Sign up
            </Button>
        </div>
    ),
};

export const Pagination: Story = {
    render: () => {
        const [page, setPage] = createSignal(1);
        const totalPages = 5;

        return (
            <div style={{ display: "flex", gap: "8px", "align-items": "center" }}>
                <Button
                    variant="utility"
                    disabled={page() === 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                    Previous
                </Button>
                <span>
                    Page {page()} of {totalPages}
                </span>
                <Button
                    variant="utility"
                    disabled={page() === totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                    Next
                </Button>
            </div>
        );
    },
};

export const FormActions: Story = {
    render: () => {
        const [isSubmitting, setIsSubmitting] = createSignal(false);

        const handleSubmit = () => {
            setIsSubmitting(true);
            setTimeout(() => setIsSubmitting(false), 2000);
        };

        return (
            <div style={{ display: "flex", gap: "8px" }}>
                <Button variant="primary" onClick={handleSubmit} disabled={isSubmitting()}>
                    {isSubmitting() ? "Saving..." : "Save Changes"}
                </Button>
                <Button variant="utility" disabled={isSubmitting()}>
                    Cancel
                </Button>
            </div>
        );
    },
};

export const WelcomeButtons: Story = {
    render: () => (
        <div style={{ display: "flex", gap: "16px", "flex-direction": "column", padding: "20px" }}>
            <Button class="button-welcome" variant="primary">
                Get Started
            </Button>
            <Button variant="utility">Learn More</Button>
        </div>
    ),
};

export const AllVariants: Story = {
    render: () => (
        <div style={{ display: "flex", "flex-direction": "column", gap: "16px" }}>
            <div>
                <h4>Primary Buttons</h4>
                <div style={{ display: "flex", gap: "8px" }}>
                    <Button variant="primary">Submit</Button>
                    <Button variant="primary" disabled>
                        Disabled
                    </Button>
                    <Button variant="primary">
                        <Save size={16} />
                        Save
                    </Button>
                </div>
            </div>

            <div>
                <h4>Utility Buttons</h4>
                <div style={{ display: "flex", gap: "8px" }}>
                    <Button variant="utility">Cancel</Button>
                    <Button variant="utility" disabled>
                        Disabled
                    </Button>
                    <Button variant="utility">
                        <Copy size={16} />
                        Copy
                    </Button>
                </div>
            </div>

            <div>
                <h4>Danger Buttons</h4>
                <div style={{ display: "flex", gap: "8px" }}>
                    <Button variant="danger">Delete</Button>
                    <Button variant="danger" disabled>
                        Disabled
                    </Button>
                    <Button variant="danger">
                        <X size={16} />
                        Remove
                    </Button>
                </div>
            </div>
        </div>
    ),
};
