import { useNavigate } from "@solidjs/router";
import type { RefStub } from "catcolab-api";
import { IconButton, Spinner } from "catcolab-ui-components";
import { Dialog } from "catcolab-ui-components";
import { getAuth } from "firebase/auth";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import { useFirebaseApp } from "solid-firebase";
import { For, Match, Switch, createResource, createSignal, onMount } from "solid-js";
import { rpcResourceErr, rpcResourceOk, useApi } from "../api";
import { BrandedToolbar } from "../page";
import "./documents.css";
import { LoginGate } from "./login";

export default function TrashBin() {
    return (
        <div class="documents-page trash-bin-page">
            <BrandedToolbar />
            <div class="page-container">
                <LoginGate>
                    <TrashBinSearch />
                </LoginGate>
            </div>
        </div>
    );
}

function TrashBinSearch() {
    const api = useApi();

    const [searchQuery, setSearchQuery] = createSignal<string>("");
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

    const [pageData, { refetch }] = createResource(
        () => [debouncedQuery(), page()] as const,
        async ([debouncedQueryValue, pageValue]) => {
            const results = await api.rpc.search_ref_stubs.query({
                ownerUsernameQuery: null,
                refNameQuery: debouncedQueryValue,
                includePublicDocuments: false,
                searcherMinLevel: null,
                onlyDeleted: true,
                limit: pageSize,
                offset: pageValue * pageSize,
            });

            return results;
        },
    );

    onMount(() => {
        setDebouncedQuery("");
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
            <h3>Trash</h3>
            <div class="ref-table-outer">
                <div class="ref-table-header">
                    <div>
                        <table class="ref-table">
                            <thead>
                                <tr>
                                    <th />
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
                                        <td colspan="6">Unknown state...</td>
                                    </tr>
                                }
                            >
                                <Match when={pageData.loading}>
                                    <tr>
                                        <td colspan="6">
                                            <Spinner />
                                        </td>
                                    </tr>
                                </Match>
                                <Match when={rpcResourceErr(pageData)}>
                                    {(errRes) => (
                                        <tr>
                                            <td colspan="6">
                                                RPC Error loading documents: {errRes().message}
                                            </td>
                                        </tr>
                                    )}
                                </Match>
                                <Match when={pageData.state === "errored"}>
                                    <tr>
                                        <td colspan="6">
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
                                                refetch={refetch}
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
    refetch: () => void;
}) {
    return (
        <>
            <For each={props.items}>
                {(stub) => <RefStubRow stub={stub} onRestore={props.refetch} />}
            </For>

            <tr class="pagination-row">
                <td colspan={6} style={{ "text-align": "center" }}>
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

function RefStubRow(props: { stub: RefStub; onRestore: () => void }) {
    const firebaseApp = useFirebaseApp();
    const auth = getAuth(firebaseApp);
    const navigate = useNavigate();
    const api = useApi();

    const owner = props.stub.owner;
    const hasOwner = owner !== null;
    const isOwner = hasOwner && auth.currentUser?.uid === owner?.id;
    const ownerName = hasOwner ? (isOwner ? "me" : owner?.username) : "public";
    const canRestore = props.stub.permissionLevel === "Own";

    const [showError, setShowError] = createSignal(false);
    const [errorMessage, setErrorMessage] = createSignal("");

    const handleRestore = async () => {
        if (!canRestore) {
            return;
        }

        try {
            const result = await api.rpc.restore_ref.mutate(props.stub.refId);
            if (result.tag === "Ok") {
                props.onRestore();
                navigate("/documents");
            } else {
                setErrorMessage(`Failed to restore document: ${result.message}`);
                setShowError(true);
            }
        } catch (error) {
            setErrorMessage(`Error restoring document: ${error}`);
            setShowError(true);
        }
    };

    const handleClick = () => {
        navigate(`/${props.stub.typeName}/${props.stub.refId}`);
    };

    const handleRestoreClick = (e: MouseEvent) => {
        e.stopPropagation();
        handleRestore();
    };

    return (
        <>
            <tr class="ref-stub-row restore-row" onClick={handleClick} title="View document">
                <td class="delete-cell">
                    {canRestore && (
                        <IconButton
                            variant="primary"
                            onClick={handleRestoreClick}
                            tooltip="Restore document"
                            type="button"
                        >
                            <RotateCcw size={16} />
                        </IconButton>
                    )}
                </td>
                <td>{props.stub.typeName}</td>
                <td>{props.stub.name}</td>
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

            <Dialog open={showError()} onOpenChange={setShowError} title="Error">
                <form onSubmit={(evt) => evt.preventDefault()}>
                    <p>{errorMessage()}</p>
                    <div class="permissions-button-container">
                        <div class="permissions-spacer" />
                        <button type="button" class="ok" onClick={() => setShowError(false)}>
                            OK
                        </button>
                    </div>
                </form>
            </Dialog>
        </>
    );
}
