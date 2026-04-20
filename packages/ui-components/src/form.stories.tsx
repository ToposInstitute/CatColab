import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import {
    CheckboxField,
    FormGroup,
    InputField,
    SelectField,
    TextAreaField,
    TextInputField,
} from "./form";

const meta = {
    title: "Forms & Inputs/Form",
    component: FormGroup,
} satisfies Meta<typeof FormGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Summary: Story = {
    render: () => {
        const [name, setName] = createSignal("");
        const [email, setEmail] = createSignal("");
        const [role, setRole] = createSignal("");

        return (
            <FormGroup>
                <TextInputField
                    label="Name"
                    value={name()}
                    onInput={(e) => setName(e.currentTarget.value)}
                />
                <TextInputField
                    label="Email"
                    value={email()}
                    onInput={(e) => setEmail(e.currentTarget.value)}
                />
                <SelectField
                    label="Role"
                    value={role()}
                    onInput={(e) => setRole(e.currentTarget.value)}
                >
                    <option value="">Select a role</option>
                    <option value="admin">Admin</option>
                    <option value="user">User</option>
                </SelectField>
            </FormGroup>
        );
    },
    tags: ["!autodocs", "!dev"],
};

export const BasicFormGroup: Story = {
    render: () => {
        const [username, setUsername] = createSignal("");
        const [password, setPassword] = createSignal("");

        return (
            <FormGroup>
                <TextInputField
                    label="Username"
                    value={username()}
                    onInput={(e) => setUsername(e.currentTarget.value)}
                />
                <InputField
                    type="password"
                    label="Password"
                    value={password()}
                    onInput={(e) => setPassword(e.currentTarget.value)}
                />
            </FormGroup>
        );
    },
};

export const CompactFormGroup: Story = {
    render: () => {
        const [limitPaths, setLimitPaths] = createSignal(false);
        const [maxLength, setMaxLength] = createSignal(10);

        return (
            <FormGroup compact>
                <InputField
                    type="checkbox"
                    label="Limit length of paths"
                    checked={limitPaths()}
                    onChange={(e) => setLimitPaths(e.currentTarget.checked)}
                />
                <InputField
                    type="number"
                    label="Maximum length of path"
                    min="0"
                    value={maxLength()}
                    onChange={(e) => setMaxLength(Number(e.currentTarget.value))}
                    disabled={!limitPaths()}
                />
            </FormGroup>
        );
    },
};

export const WithValidation: Story = {
    render: () => {
        const [email, setEmail] = createSignal("");
        const [error, setError] = createSignal("");

        const validateEmail = (value: string) => {
            if (!value) {
                setError("Email is required");
            } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                setError("Invalid email format");
            } else {
                setError("");
            }
        };

        return (
            <FormGroup>
                <TextInputField
                    label="Email"
                    value={email()}
                    error={error()}
                    onInput={(e) => {
                        setEmail(e.currentTarget.value);
                        validateEmail(e.currentTarget.value);
                    }}
                />
            </FormGroup>
        );
    },
};

export const SelectFieldVariants: Story = {
    render: () => {
        const [access, setAccess] = createSignal("");
        const [engine, setEngine] = createSignal("directed");

        return (
            <FormGroup>
                <SelectField
                    label="General access"
                    value={access()}
                    onInput={(e) => setAccess(e.currentTarget.value)}
                >
                    <option value="">Only authorized people can access</option>
                    <option value="Read">Anyone can view</option>
                    <option value="Write">Anyone can edit</option>
                </SelectField>
                <SelectField
                    label="Layout engine"
                    value={engine()}
                    onChange={(e) => setEngine(e.currentTarget.value)}
                >
                    <option value="directed">Directed</option>
                    <option value="undirected">Undirected</option>
                    <option value="hierarchical">Hierarchical</option>
                </SelectField>
            </FormGroup>
        );
    },
};

export const TextAreaExample: Story = {
    render: () => {
        const [description, setDescription] = createSignal("");
        const [json, setJson] = createSignal("");

        return (
            <FormGroup>
                <TextAreaField
                    label="Description"
                    value={description()}
                    onInput={(e) => setDescription(e.currentTarget.value)}
                    placeholder="Enter a description..."
                />
                <TextAreaField
                    label="JSON Data"
                    value={json()}
                    onInput={(e) => setJson(e.currentTarget.value)}
                    placeholder="Paste your JSON here..."
                />
            </FormGroup>
        );
    },
};

export const MixedInputTypes: Story = {
    render: () => {
        const [name, setName] = createSignal("");
        const [age, setAge] = createSignal(0);
        const [subscribe, setSubscribe] = createSignal(false);
        const [country, setCountry] = createSignal("");

        return (
            <FormGroup>
                <TextInputField
                    label="Full Name"
                    value={name()}
                    onInput={(e) => setName(e.currentTarget.value)}
                />
                <InputField
                    type="number"
                    label="Age"
                    min="0"
                    max="120"
                    value={age()}
                    onInput={(e) => setAge(Number(e.currentTarget.value))}
                />
                <InputField
                    type="checkbox"
                    label="Subscribe to newsletter"
                    checked={subscribe()}
                    onChange={(e) => setSubscribe(e.currentTarget.checked)}
                />
                <SelectField
                    label="Country"
                    value={country()}
                    onInput={(e) => setCountry(e.currentTarget.value)}
                >
                    <option value="">Select country</option>
                    <option value="us">United States</option>
                    <option value="uk">United Kingdom</option>
                    <option value="ca">Canada</option>
                </SelectField>
            </FormGroup>
        );
    },
};

export const Checkbox: Story = {
    render: () => {
        const [darkMode, setDarkMode] = createSignal(false);
        const [notifications, setNotifications] = createSignal(true);
        const [autoSave, setAutoSave] = createSignal(true);

        return (
            <FormGroup>
                <CheckboxField
                    label="Dark mode"
                    checked={darkMode()}
                    onChange={(e) => setDarkMode(e.currentTarget.checked)}
                />
                <CheckboxField
                    label="Enable notifications"
                    checked={notifications()}
                    onChange={(e) => setNotifications(e.currentTarget.checked)}
                />
                <CheckboxField
                    label="Auto-save"
                    checked={autoSave()}
                    onChange={(e) => setAutoSave(e.currentTarget.checked)}
                />
            </FormGroup>
        );
    },
};

export const FileUpload: Story = {
    render: () => {
        const [selectedFile, setSelectedFile] = createSignal<string>("");

        const handleFileChange = (e: Event) => {
            const target = e.currentTarget as HTMLInputElement;
            const file = target.files?.[0];
            if (file) {
                setSelectedFile(file.name);
            }
        };

        return (
            <FormGroup>
                <InputField
                    type="file"
                    label="Import from file"
                    accept=".json,application/json"
                    onChange={handleFileChange}
                />
                {selectedFile() && <p>Selected file: {selectedFile()}</p>}
            </FormGroup>
        );
    },
};
