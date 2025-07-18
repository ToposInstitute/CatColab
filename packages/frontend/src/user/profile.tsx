import { type SubmitHandler, createForm, reset } from "@modular-forms/solid";
import { createEffect, createResource, createSignal } from "solid-js";
import invariant from "tiny-invariant";

import type { UserProfile } from "catcolab-api";
import { useApi } from "../api";
import { FormGroup, TextInputField, SuccessMessage} from "../components";
import { BrandedToolbar } from "../page";
import { LoginGate } from "./login";

/** Page to configure user profile. */
export default function UserProfilePage() {
    return (
        <div class="growable-container">
            <BrandedToolbar />
            <div class="page-container">
                <LoginGate>
                    <h2>Public profile</h2>
                    <UserProfileForm />
                </LoginGate>
            </div>
        </div>
    );
}

/** Form to configure user profile. */
export function UserProfileForm() {
    const api = useApi();
    const [showSuccess, setShowSuccess] = createSignal(false);

    const [currentProfile, { refetch: refetchProfile }] = createResource(async () => {
        const result = await api.rpc.get_active_user_profile.query();
        invariant(result.tag === "Ok");
        return result.content;
    });

    const [form, { Form, Field }] = createForm<UserProfile>();

    createEffect(() => {
        reset(form, { initialValues: currentProfile() });
    });

    const onSubmit: SubmitHandler<UserProfile> = async (values) => {
        try {
            await api.rpc.set_active_user_profile.mutate({
                username: values.username ? values.username : null,
                displayName: values.displayName ? values.displayName : null,
            });
            refetchProfile();
            
            // Show success message
            setShowSuccess(true);
        } catch (error) {
            console.error("Failed to update profile:", error);
            // You could add error handling here if needed
        }
    };

    const validateUsername = async (value?: string | null) => {
        const currentName = currentProfile()?.username;
        if (value == null || value === currentName) {
            return "";
        }
        if (!value && typeof currentName === "string") {
            return "You cannot remove your username, though you can choose a new one.";
        }

        const result = await api.rpc.username_status.query(value);
        invariant(result.tag === "Ok");

        if (result.content === "Unavailable") {
            return "Username is already taken. Please try another one.";
        }
        if (result.content === "Invalid") {
            return "Username is not valid. The characters allowed are alphanumeric, dots, dashes, and underscores.";
        }
        return "";
    };

    return (
        <>
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
                <button type="submit">Update profile</button>
            </Form>

            {/* Success message */}
            {showSuccess() && (
                <SuccessMessage 
                    message="Your profile has been updated successfully!"
                    onClose={() => setShowSuccess(false)}
                    autoClose={true}
                    duration={4000}
                />
            )}
        </>
    );
}