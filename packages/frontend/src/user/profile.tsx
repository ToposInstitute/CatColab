import { type SubmitHandler, createForm, reset } from "@modular-forms/solid";
import { createSignal, createEffect, createResource, Show } from "solid-js";
import invariant from "tiny-invariant";

import type { UserProfile } from "catcolab-api";
import { useApi } from "../api";
import { FormGroup, TextInputItem } from "../components";
import { BrandedToolbar } from "../page";
import { LoginGate } from "./login";

import "./profile.css";

/** Page to configure user profile. */
export default function UserProfilePage() {
    const [myRefs, setMyRefs] = createSignal<any>(null);

    return (
        <div class="growable-container">
            <BrandedToolbar />
            <div class="page-container">
                <LoginGate>
                    <h2>Public profile</h2>
                    <UserProfileForm onRefsLoaded={setMyRefs} />
                    <div style="margin-top: 1rem;">
                        <h3
                            style="
        margin: 0 0 0.5rem 0;
        color: #24292e;
        font-size: 1.25rem;
        font-weight: 500;
    "
                        >
                            Your Documents
                        </h3>
                        <Show
                            when={myRefs()}
                            fallback={<div> Loading user files... </div>}
                            keyed
                        >
                            {(items) => {
                                return (
                                    <div class="files">
                                        {items.map(
                                            ([id, title]: [string, string]) => (
                                                <a
                                                    href={`${import.meta.env.VITE_SERVER_URL}/model/${id}`}
                                                    class="
                filebutton
            "
                                                    onMouseOver={(e) => {
                                                        e.currentTarget.style.boxShadow =
                                                            "0 2px 8px rgba(0,0,0,0.1)";
                                                    }}
                                                    onMouseOut={(e) => {
                                                        e.currentTarget.style.boxShadow =
                                                            "none";
                                                    }}
                                                >
                                                    {title || "(Untitled)"}
                                                </a>
                                            )
                                        )}
                                    </div>
                                );
                            }}
                        </Show>
                    </div>
                </LoginGate>
            </div>
        </div>
    );
}

/** Form to configure user proifle. */
export function UserProfileForm(props: { onRefsLoaded?: (refs: any) => void }) {
    const api = useApi();
    const [currentProfile, { refetch: refetchProfile }] = createResource(async () => {
        const result = await api.rpc.get_active_user_profile.query();
        invariant(result.tag === "Ok");
        console.log("cpTest",result.content);
        return result.content;
    });
    const [userRefs, setUserRefs] = createSignal<any>(null); 
    createEffect(() => {
        if (userRefs()) {
          props.onRefsLoaded?.(userRefs());
        }
      });
    


    const [form, { Form, Field }] = createForm<UserProfile>();

    createEffect(() => {
        reset(form, { initialValues: currentProfile() });
    });

    createEffect(async () => {
        const profile = currentProfile();
        if (!profile) {
            return;
        }
        invariant(profile.username != null, "Profile username must be defined and not null");
        const result = await api.rpc.get_user_refs_and_titles.query(profile.username);
        invariant(result.tag === "Ok");  
        console.log("get_refs_test",result.content);
        setUserRefs(result.content);
    });

    const onSubmit: SubmitHandler<UserProfile> = async (values) => {
        await api.rpc.set_active_user_profile.mutate({
            username: values.username ? values.username : null,
            displayName: values.displayName ? values.displayName : null,
        });
        refetchProfile();
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
        <Form onSubmit={onSubmit}>
            <FormGroup>
                <Field
                    name="username"
                    validate={validateUsername}
                    validateOn="submit"
                    revalidateOn="submit"
                >
                    {(field, props) => (
                        <TextInputItem
                            {...props}
                            id="username"
                            label="Username"
                            value={field.value ?? ""}
                            error={field.error}
                        />
                    )}
                </Field>
                <Field name="displayName">
                    {(field, props) => (
                        <TextInputItem
                            {...props}
                            id="displayName"
                            label="Display name"
                            value={field.value ?? ""}
                        />
                    )}
                </Field>
            </FormGroup>
            <button type="submit">Update profile</button>
        </Form>
    );
}
