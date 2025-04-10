import type { RefStub } from "catcolab-api";
import { getAuth } from "firebase/auth";
import { useFirebaseApp } from "solid-firebase";
import { For, Match, Switch, createResource, createSignal, onMount } from "solid-js";
import { resultErr, resultOk, useApi } from "../api";
import { BrandedToolbar } from "../page";
import { LoginGate } from "./login";
import "./documents.css";

export default function UserDocuments() {
    return (
        <div class="documents-page">
            <BrandedToolbar />
            <div class="page-container">
                <LoginGate>
                    <DocumentsSearch />
                </LoginGate>
            </div>
        </div>
    );
}

function DocumentsSearch() {
    const api = useApi();

    const [searchQuery, setSearchQuery] = createSignal<string>("");
    const [debouncedQuery, setDebouncedQuery] = createSignal<string | null>(null);
    const [latestRequestId, setLatestRequestId] = createSignal(0);

    let debounceTimer: ReturnType<typeof setTimeout>;
    const updateQuery = (value: string) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => setDebouncedQuery(value), 300);
        setSearchQuery(value);
    };

    const [refStubs] = createResource(debouncedQuery, async (query) => {
        const requestId = latestRequestId() + 1;
        setLatestRequestId(requestId);

        const result = await api.rpc.search_ref_stubs.query({
            owner_username_query: null,
            ref_name_query: query,
            include_public_documents: false,
            searcher_min_level: null,
        });

        if (latestRequestId() !== requestId) {
            // A newer query was issued — discard this one
            return;
        }
        return result;
    });

    onMount(() => {
        setDebouncedQuery(""); // Trigger fetch on page load
    });

    return (
        <>
            <input
                type="text"
                class="search-input"
                placeholder="Search..."
                value={searchQuery()}
                onInput={(e) => updateQuery(e.currentTarget.value)}
            />
            <h3>My Documents</h3>
            <div class="ref-table-outer">
                <div class="ref-table-header">
                    <div>
                        <table class="ref-table">
                            <thead>
                                <tr>
                                    <th>Type</th>
                                    <th>Name</th>
                                    <th>Owner</th>
                                    <th>Permissions</th>
                                    <th>Created At</th>
                                </tr>
                            </thead>
                        </table>
                    </div>
                </div>
                <div class="ref-table-scroll">
                    <table class="ref-table">
                        <tbody>
                            <Switch
                                fallback={
                                    <tr>
                                        <td colspan="5">Loading...</td>
                                    </tr>
                                }
                            >
                                <Match when={resultOk(refStubs())}>
                                    {(okRes) => (
                                        <For each={okRes()}>
                                            {(stub) => <RefStubRow stub={stub} />}
                                        </For>
                                    )}
                                </Match>
                                <Match when={resultErr(refStubs())}>
                                    {(errRes) => (
                                        <tr>
                                            <td colspan="5">
                                                Error loading documents: {errRes().message}
                                            </td>
                                        </tr>
                                    )}
                                </Match>
                            </Switch>
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}

export function RefStubRow(props: { stub: RefStub }) {
    const firebaseApp = useFirebaseApp();
    const auth = getAuth(firebaseApp);

    const owner = props.stub.owner;
    const hasOwner = owner !== null;
    const isOwner = hasOwner && auth.currentUser?.uid === owner?.id;
    // biome-ignore lint/style/noNonNullAssertion: type narrowing doesn't work for ternary statements
    const ownerName = hasOwner ? (isOwner ? "me" : owner!.username) : "public";

    const handleClick = () => {
        const url = getUrlForRefStub(props.stub);
        window.location.href = url;
    };

    return (
        <tr class="ref-stub-row" onClick={handleClick}>
            <td>{props.stub.type_name}</td>
            <td>{props.stub.name}</td>
            <td>{ownerName}</td>
            <td>{props.stub.permission_level}</td>
            <td>
                {new Date(props.stub.created_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                })}
            </td>
        </tr>
    );
}

function getUrlForRefStub(refStub: RefStub): string {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const port = window.location.port;
    return `${protocol}//${hostname}:${port}/${refStub.type_name}/${refStub.ref_id}`;
}
