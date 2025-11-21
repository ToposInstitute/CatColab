import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { type DocumentType, DocumentTypeIcon } from "./document_type_icon";
import { theoryToLetterMap } from "./model_file_icon";

const meta = {
    title: "Icons/DocumentTypeIcon",
    component: DocumentTypeIcon,
} satisfies Meta<typeof DocumentTypeIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

const documentTypes: DocumentType[] = ["model", "diagram", "analysis"];
const theories = Object.keys(theoryToLetterMap);

export const Summary: Story = {
    render: () => (
        <div style={{ display: "flex", gap: "8px", "align-items": "center" }}>
            <DocumentTypeIcon documentType="model" />
            <DocumentTypeIcon documentType="diagram" />
            <DocumentTypeIcon documentType="analysis" />
        </div>
    ),
    tags: ["!autodocs", "!dev"],
};

export const AllDocumentTypes: Story = {
    render: () => (
        <div style={{ display: "flex", gap: "16px", "align-items": "center" }}>
            <For each={documentTypes}>
                {(docType) => (
                    <div
                        style={{
                            display: "flex",
                            "flex-direction": "column",
                            "align-items": "center",
                            gap: "8px",
                        }}
                    >
                        <DocumentTypeIcon documentType={docType} />
                        <span style={{ "font-size": "12px" }}>{docType}</span>
                    </div>
                )}
            </For>
        </div>
    ),
};

export const ModelWithTheories: Story = {
    render: () => (
        <div
            style={{
                display: "grid",
                "grid-template-columns": "repeat(auto-fill, minmax(120px, 1fr))",
                gap: "16px",
            }}
        >
            <div
                style={{
                    display: "flex",
                    "flex-direction": "column",
                    "align-items": "center",
                    gap: "8px",
                }}
            >
                <DocumentTypeIcon documentType="model" />
                <span style={{ "font-size": "12px" }}>model (no theory)</span>
            </div>
            <For each={theories}>
                {(theory) => (
                    <div
                        style={{
                            display: "flex",
                            "flex-direction": "column",
                            "align-items": "center",
                            gap: "8px",
                        }}
                    >
                        <DocumentTypeIcon documentType="model" theory={theory} />
                        <span style={{ "font-size": "12px" }}>{theory}</span>
                    </div>
                )}
            </For>
        </div>
    ),
};

export const DeletedDocuments: Story = {
    render: () => (
        <div style={{ display: "flex", gap: "16px", "align-items": "center" }}>
            <For each={documentTypes}>
                {(docType) => (
                    <div
                        style={{
                            display: "flex",
                            "flex-direction": "column",
                            "align-items": "center",
                            gap: "8px",
                        }}
                    >
                        <DocumentTypeIcon documentType={docType} isDeleted={true} />
                        <span style={{ "font-size": "12px" }}>{docType} (deleted)</span>
                    </div>
                )}
            </For>
        </div>
    ),
};

export const DeletedModelWithTheory: Story = {
    render: () => (
        <div style={{ display: "flex", gap: "16px", "align-items": "center" }}>
            <div
                style={{
                    display: "flex",
                    "flex-direction": "column",
                    "align-items": "center",
                    gap: "8px",
                }}
            >
                <DocumentTypeIcon documentType="model" theory="simple-olog" isDeleted={false} />
                <span style={{ "font-size": "12px" }}>active</span>
            </div>
            <div
                style={{
                    display: "flex",
                    "flex-direction": "column",
                    "align-items": "center",
                    gap: "8px",
                }}
            >
                <DocumentTypeIcon documentType="model" theory="simple-olog" isDeleted={true} />
                <span style={{ "font-size": "12px" }}>deleted</span>
            </div>
        </div>
    ),
};
