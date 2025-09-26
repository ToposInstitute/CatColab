import type { RefStub } from "catcolab-api";
import { getAuth } from "firebase/auth";
import { useFirebaseApp } from "solid-firebase";
import { For, Match, Switch, createResource, createSignal, onMount } from "solid-js";
import { rpcResourceErr, rpcResourceOk, useApi } from "../api";
import { BrandedToolbar } from "../page";
import { LoginGate } from "./login";
import "./documents.css";
import { useNavigate } from "@solidjs/router";
import { Spinner } from "../components/spinner";
import ChartSpline from "lucide-solid/icons/chart-spline";
import File from "lucide-solid/icons/file";
import UploadIcon from "lucide-solid/icons/upload";
import { IconButton } from "../components";
import invariant from "tiny-invariant";

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

    const [currentProfile] = createResource(async () => {
        const result = await api.rpc.get_active_user_profile.query();

        invariant(result.tag === "Ok");
        result.content?.username && localStorage.setItem("username", result.content.username)
        return result.content;
    });
    const [searchQuery, setSearchQuery] = createSignal<string>("");
    const [showOwnedOnlyDocument, setShowOwnedOnlyDocument] = createSignal(false);
    const [debouncedQuery, setDebouncedQuery] = createSignal<string | null>(null);
    const [page, setPage] = createSignal(0);
    const pageSize = 15;

    let debounceTimer: ReturnType<typeof setTimeout>;
    const updateQuery = (value: string) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => setDebouncedQuery(value), 300);
        setSearchQuery(value);
        setPage(0);
    };

    const [pageData] = createResource(
        () => [debouncedQuery(), page(), showOwnedOnlyDocument()] as const,
        async ([debouncedQueryValue, pageValue, showOwnedOnlyDocumentValue]) => {

            const results = await api.rpc.search_ref_stubs.query({
                ownerUsernameQuery: showOwnedOnlyDocumentValue ? localStorage.getItem("username") : null,
                refNameQuery: debouncedQueryValue,
                includePublicDocuments: false,
                searcherMinLevel: null,
                limit: pageSize,
                offset: pageValue * pageSize,
            });

            return results;
        },
        {
            deferStream: true,
        }
    );

    onMount(() => {
        setDebouncedQuery(""); // Trigger fetch on page load
        currentProfile()
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
            <label class="show_only_mine_filter"> Show only mine
                <input
                    class="fixed-table-cell-input"
                    type="checkbox"
                    checked={showOwnedOnlyDocument()}
                    onInput={e => {
                        setShowOwnedOnlyDocument(e.currentTarget.checked)
                    }}
                />
            </label>

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
                                        {/* I think this is only used if `pageData.state` is "unresolved",
                                            however the docs are specify which states cause `loading` to be
                                            true, nor why the state would ever be "unresolved".
                                        */}
                                        <td colspan="5">Unknown state...</td>
                                    </tr>
                                }
                            >
                                <Match when={pageData.loading}>
                                    <tr>
                                        <td colspan="5">
                                            <Spinner />
                                        </td>
                                    </tr>
                                </Match>
                                <Match when={rpcResourceErr(pageData)}>
                                    {(errRes) => (
                                        <tr>
                                            <td colspan="5">
                                                RPC Error loading documents: {errRes().message}
                                            </td>
                                        </tr>
                                    )}
                                </Match>
                                <Match when={pageData.state === "errored"}>
                                    <tr>
                                        <td colspan="5">
                                            Error caught by fetcher:{" "}
                                            {JSON.stringify(pageData.error, null, 2)}
                                        </td>
                                    </tr>
                                </Match>
                                <Match when={rpcResourceOk(pageData)}>
                                    {(res) => {
                                        const { items, total } = res().content;
                                        return (
                                            <DocumentRowsPagination
                                                items={items}
                                                total={total}
                                                page={page()}
                                                setPage={setPage}
                                                pageSize={pageSize}
                                            />
                                        );
                                    }}
                                </Match>
                            </Switch>
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}

function DocumentRowsPagination(props: {
    items: RefStub[];
    total: number;
    page: number;
    setPage: (p: number) => void;
    pageSize: number;
}) {
    return (
        <>
            <For each={props.items}>{(stub) => <RefStubRow stub={stub} />}</For>

            <tr class="pagination-row">
                <td colspan={5} style={{ "text-align": "center" }}>
                    <button
                        disabled={props.page === 0}
                        onClick={() => props.setPage(props.page - 1)}
                    >
                        Previous
                    </button>

                    <span class="page-info">
                        Page {props.page + 1} of {Math.ceil(props.total / props.pageSize) || 1}
                    </span>

                    <button
                        disabled={(props.page + 1) * props.pageSize >= props.total}
                        onClick={() => props.setPage(props.page + 1)}
                    >
                        Next
                    </button>
                </td>
            </tr>
        </>
    );
}

function RefStubRow(props: { stub: RefStub }) {
    const firebaseApp = useFirebaseApp();
    const auth = getAuth(firebaseApp);
    const navigate = useNavigate();

    const owner = props.stub.owner;
    const hasOwner = owner !== null;
    const isOwner = hasOwner && auth.currentUser?.uid === owner?.id;
    // biome-ignore lint/style/noNonNullAssertion: type narrowing doesn't work for ternary statements
    const ownerName = hasOwner ? (isOwner ? "me" : owner!.username) : "public";

    const handleClick = () => {
        navigate(`/${props.stub.typeName}/${props.stub.refId}`);
    };

    return (
        <tr class="ref-stub-row" onClick={handleClick}>
            <td class=" tooltip" data-tooltip={props.stub.typeName}><DocumentIconType typeName={props.stub.typeName}></DocumentIconType></td>
            <td class=" tooltip" data-tooltip={props.stub.typeName}>{props.stub.name}</td>
            <td>{ownerName}</td>
            <td>{props.stub.permissionLevel}</td>
            <td>
                {new Date(props.stub.createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                })}
            </td>
        </tr>
    );
}

function DocumentIconType(props: { typeName?: string }) {

    return (
        <IconButton tooltip={props.typeName ?? "unknown"}>
            <Switch fallback={props.typeName}>
                <Match when={props.typeName === "analysis"}>
                    <ChartSpline size={20} />
                </Match>
                <Match when={props.typeName === "diagram"}>
                    <UploadIcon size="20" />
                </Match>
                <Match when={props.typeName === "model"}>
                    <File size="20" />
                </Match>
            </Switch>
        </IconButton>
    );
}