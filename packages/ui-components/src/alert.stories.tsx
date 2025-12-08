import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { ErrorAlert, Note, Question, Warning } from "../src/alert";

const meta = {
    title: "Messages/Alert",
} satisfies Meta<typeof Warning>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Summary: Story = {
    render: (args) => (
        <>
            <Warning {...args}>
                <p>This is a warning message. Please review the action before proceeding.</p>
            </Warning>
            <ErrorAlert {...args}>
                <p>An error occurred while processing your request. Please try again later.</p>
            </ErrorAlert>
            <Note {...args}>
                <p>This is an informational note to help you understand the feature.</p>
            </Note>
            <Question {...args}>
                <p>Did you know you can customize the alert title?</p>
            </Question>
        </>
    ),
    // excluding from autodocs and dev seems to be the way to have this
    // component as the first thing in the docs and only there
    tags: ["!autodocs", "!dev"],
};

export const WarningAlert: Story = {
    render: (args) => (
        <Warning {...args}>
            <p>This is a warning message. Please review the action before proceeding.</p>
        </Warning>
    ),
    args: {},
};

export const WarningWithCustomTitle: Story = {
    render: (args) => (
        <Warning {...args}>
            <p>This is a warning with a custom title.</p>
        </Warning>
    ),
    args: {
        title: "Custom Warning",
    },
};

export const ErrorAlertStory: Story = {
    storyName: "Error Alert",
    render: (args) => (
        <ErrorAlert {...args}>
            <p>An error occurred while processing your request. Please try again later.</p>
        </ErrorAlert>
    ),
    args: {},
};

export const ErrorWithCustomTitle: Story = {
    render: (args) => (
        <ErrorAlert {...args}>
            <p>Something went wrong with the custom error.</p>
        </ErrorAlert>
    ),
    args: {
        title: "Critical Error",
    },
};

export const NoteAlert: Story = {
    render: (args) => (
        <Note {...args}>
            <p>This is an informational note to help you understand the feature.</p>
        </Note>
    ),
    args: {},
};

export const NoteWithCustomTitle: Story = {
    render: (args) => (
        <Note {...args}>
            <p>Here's some important information you should know.</p>
        </Note>
    ),
    args: {
        title: "Important Information",
    },
};

export const QuestionAlert: Story = {
    render: (args) => (
        <Question {...args}>
            <p>Did you know you can customize the alert title?</p>
        </Question>
    ),
    args: {},
};

export const QuestionWithCustomTitle: Story = {
    render: (args) => (
        <Question {...args}>
            <p>Would you like to learn more about this feature?</p>
        </Question>
    ),
    args: {
        title: "Quick Question",
    },
};

export const AlertWithMultipleParagraphs: Story = {
    render: (args) => (
        <Note {...args}>
            <p>This alert contains multiple paragraphs of content.</p>
            <p>Each paragraph provides additional context and information.</p>
            <p>You can add as many paragraphs as needed to convey your message.</p>
        </Note>
    ),
    args: {
        title: "Detailed Information",
    },
};
