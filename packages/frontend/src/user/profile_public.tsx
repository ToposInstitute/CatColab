import { A, useParams } from "@solidjs/router";
import { For, Show, createEffect, createSignal } from "solid-js";
import { useApi } from "../api";
import "./profile_public.css";
import invariant from "tiny-invariant";

export default function PublicProfilePage() {
    const api = useApi();
    const params = useParams();

    const [userModels, setUserModels] = createSignal<[string, string][]>(); //QQQ: unclear what type the RPC call should return to; Documents?
    createEffect(async () => {
        invariant(params.username, "Must provide username in URL"); //QQ: or just return if no username?
        const result = await api.rpc.get_user_refs_and_titles.query(params.username);
        invariant(result.tag === "Ok", "RPC call failed");
        console.log("get_refs_test", result.content);
        setUserModels(result.content);
    });
    return (
        <div>
            <h3 class="section-title">{params.username}'s Documents</h3>
            {/* XX: Should be display name */}
            <Show when={userModels()} fallback={<div> Loading user files... </div>} keyed>
                {(models) => {
                    return (
                        <div class="file_list">
                            <For each={models}>
                                {([id, title]: [string, string]) => (
                                    <A
                                        href={`/model/${id}`}
                                        class="file_entry"
                                    >
                                        {title || "(Untitled)"}
                                    </A>
                                )}
                            </For>
                        </div>
                    );
                }}
            </Show>
        </div>
    );
}
