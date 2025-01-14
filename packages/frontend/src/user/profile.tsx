import { type SubmitHandler, createForm, reset } from "@modular-forms/solid";
import { createEffect, createResource } from "solid-js";

import type { UserProfile } from "catcolab-api";
import { useApi } from "../api";
import { BrandedToolbar } from "../page";
import { LoginGate } from "./login";

/** Page to configure user profile. */
export default function UserProfilePage() {
    return (
        <div class="growable-container">
            <BrandedToolbar />
            <div class="profile-container">
                <UserProfileForm />
            </div>
        </div>
    );
}

function UserProfileForm() {
    const api = useApi();

    const [currentData] = createResource(async () => {
        const result = await api.rpc.get_active_user_profile.query();
        return result.tag === "Ok" ? result.content : undefined;
    });

    const [form, { Form, Field }] = createForm<UserProfile>();

    createEffect(() => {
        reset(form, { initialValues: currentData() });
    });

    const onSubmit: SubmitHandler<UserProfile> = (values) => {
        return api.rpc.set_active_user_profile.mutate({
            username: values.username ? values.username : null,
            display_name: values.display_name ? values.display_name : null,
        });
    };

    return (
        <LoginGate>
            <Form onSubmit={onSubmit}>
                <Field name="username">
                    {(field, props) => (
                        <label>
                            <span>Username</span>
                            <input {...props} type="text" value={field.value ?? ""} />
                        </label>
                    )}
                </Field>
                <Field name="display_name">
                    {(field, props) => (
                        <label>
                            <span>Display name</span>
                            <input {...props} type="text" value={field.value ?? ""} />
                        </label>
                    )}
                </Field>
                <button type="submit">Update profile</button>
            </Form>
        </LoginGate>
    );
}
