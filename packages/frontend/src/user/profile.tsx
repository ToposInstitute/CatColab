import { type SubmitHandler, createForm, reset } from "@modular-forms/solid";
import { createEffect, createResource } from "solid-js";

import type { UserProfile } from "catcolab-api";
import { useApi } from "../api";
import { FormGroup, TextInputItem } from "../components";
import { BrandedToolbar } from "../page";
import { LoginGate } from "./login";

/** Page to configure user profile. */
export default function UserProfilePage() {
    return (
        <div class="growable-container">
            <BrandedToolbar />
            <div class="page-container">
                <h2>Public profile</h2>
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
                <FormGroup>
                    <Field name="username">
                        {(field, props) => (
                            <TextInputItem
                                {...props}
                                id="username"
                                label="Username"
                                value={field.value ?? ""}
                            />
                        )}
                    </Field>
                    <Field name="display_name">
                        {(field, props) => (
                            <TextInputItem
                                {...props}
                                id="display_name"
                                label="Display name"
                                value={field.value ?? ""}
                            />
                        )}
                    </Field>
                </FormGroup>
                <button type="submit">Update profile</button>
            </Form>
        </LoginGate>
    );
}
