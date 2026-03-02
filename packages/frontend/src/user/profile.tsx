import { createForm, reset, type SubmitHandler } from "@modular-forms/solid";
import { Title } from "@solidjs/meta";
import { createEffect } from "solid-js";

import type { UserProfile } from "catcolab-api";
import { Button, FormGroup, TextInputField } from "catcolab-ui-components";
import { useApi } from "../api";
import { BrandedToolbar } from "../page";
import { LoginGate } from "./login";
import { useUserState } from "./user_state_context";

/** Page to configure user profile. */
export default function UserProfilePage() {
    const appTitle = import.meta.env.VITE_APP_TITLE;

    return (
        <>
            <Title>Profile - {appTitle}</Title>
            <div class="growable-container">
                <BrandedToolbar />
                <div class="page-container">
                    <LoginGate>
                        <h2>Public profile</h2>
                        <UserProfileForm />
                    </LoginGate>
                </div>
            </div>
        </>
    );
}

/** Form to configure user proifle. */
export function UserProfileForm() {
    const api = useApi();
    const userState = useUserState();

    const [form, { Form, Field }] = createForm<UserProfile>();

    createEffect(() => {
        const { username, displayName } = userState.profile;
        reset(form, { initialValues: { username, displayName } });
    });

    const onSubmit: SubmitHandler<UserProfile> = async (values) => {
        await api.rpc.set_active_user_profile.mutate({
            username: values.username ? values.username : null,
            displayName: values.displayName ? values.displayName : null,
        });
    };

    const validateUsername = async (value?: string | null) => {
        const currentName = userState.profile.username;
        if (value == null || value === currentName) {
            return "";
        }
        if (!value && typeof currentName === "string") {
            return "You cannot remove your username, though you can choose a new one.";
        }

        const result = await api.rpc.username_status.query(value);
        if (result.tag !== "Ok") {
            return "Unable to validate username.";
        }

        if (result.content === "Unavailable") {
            return "Username is already taken. Please try another one.";
        }
        if (result.content === "Invalid") {
            return "Username is not valid. The characters allowed are alphanumeric, dots, dashes, and underscores.";
        }
        return "";
    };

    return (
        <Form onSubmit={onSubmit}>
            <FormGroup>
                <Field
                    name="username"
                    validate={validateUsername}
                    validateOn="submit"
                    revalidateOn="submit"
                >
                    {(field, props) => (
                        <TextInputField
                            {...props}
                            label="Username"
                            value={field.value ?? ""}
                            error={field.error}
                        />
                    )}
                </Field>
                <Field name="displayName">
                    {(field, props) => (
                        <TextInputField {...props} label="Display name" value={field.value ?? ""} />
                    )}
                </Field>
            </FormGroup>
            <Button type="submit" variant="positive">
                Update profile
            </Button>
        </Form>
    );
}
