import type { RefStub } from "catcolab-api";
import { getAuth } from "firebase/auth";
import { useFirebaseApp } from "solid-firebase";
import { For, Match, Switch, createEffect, createResource, createSignal, onMount } from "solid-js";
import { rpcResourceErr, rpcResourceOk, useApi } from "../api";
import { BrandedToolbar } from "../page";
import { LoginGate } from "./login";
import "./documents.css";
import { useNavigate } from "@solidjs/router";
import { Button, Dialog, IconButton, Spinner } from "catcolab-ui-components";
import X from "lucide-solid/icons/x";

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
        () => [debouncedQuery(), page()] as const,
        async ([debouncedQueryValue, pageValue]) => {
            const results = await api.rpc.search_ref_stubs.query({
                ownerUsernameQuery: null,
                refNameQuery: debouncedQueryValue,
                includePublicDocuments: false,
                searcherMinLevel: null,
                limit: pageSize,
                offset: pageValue * pageSize,
            });

            return results;
        },
    );

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
                                    <th />
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
    const [items, setItems] = createSignal<RefStub[]>([]);
    createEffect(() => {
        setItems(props.items);
    });
    const optimisticDelete = (stub: RefStub) => () =>
        setItems((items) => items.filter((item) => item.refId !== stub.refId));
    return (
        <>
            <For each={items()}>
                {(stub) => <RefStubRow stub={stub} onDelete={optimisticDelete(stub)} />}
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

function RefStubRow(props: { stub: RefStub; onDelete: () => void }) {
    const firebaseApp = useFirebaseApp();
    const auth = getAuth(firebaseApp);
    const navigate = useNavigate();
    const api = useApi();

    const owner = props.stub.owner;
    const hasOwner = owner !== null;
    const isOwner = hasOwner && auth.currentUser?.uid === owner?.id;
    const ownerName = hasOwner ? (isOwner ? "me" : owner?.username) : "public";
    const canDelete = props.stub.permissionLevel === "Own";

    const [showDeleteConfirm, setShowDeleteConfirm] = createSignal(false);
    const [showError, setShowError] = createSignal(false);
    const [errorMessage, setErrorMessage] = createSignal("");

    const handleClick = () => {
        navigate(`/${props.stub.typeName}/${props.stub.refId}`);
    };

    const handleDeleteClick = (e: MouseEvent) => {
        e.stopPropagation();
        setShowDeleteConfirm(true);
    };

    const confirmDelete = async () => {
        setShowDeleteConfirm(false);

        try {
            const result = await api.rpc.delete_ref.mutate(props.stub.refId);
            if (result.tag === "Ok") {
                api.clearCachedDoc(props.stub.refId);
                props.onDelete();
            } else {
                setErrorMessage(`Failed to delete document: ${result.message}`);
                setShowError(true);
            }
        } catch (error) {
            setErrorMessage(`Error deleting document: ${error}`);
            setShowError(true);
        }
    };

    return (
        <>
            <tr class="ref-stub-row" onClick={handleClick}>
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
                <td class="delete-cell">
                    {canDelete && (
                        <IconButton
                            variant="danger"
                            onClick={handleDeleteClick}
                            tooltip="Delete document"
                        >
                            <X size={16} />
                        </IconButton>
                    )}
                </td>
            </tr>

            <Dialog
                open={showDeleteConfirm()}
                onOpenChange={setShowDeleteConfirm}
                title="Delete Document"
            >
                <form onSubmit={(evt) => evt.preventDefault()}>
                    <p>
                        Are you sure you want to delete{" "}
                        {props.stub.name ? (
                            <>
                                the {props.stub.typeName} "
                                {props.stub.name.length > 40
                                    ? `${props.stub.name.slice(0, 40)}...`
                                    : props.stub.name}
                                "
                            </>
                        ) : (
                            <>
                                this <em>untitled</em> {props.stub.typeName}
                            </>
                        )}
                        ?
                    </p>
                    <div class="permissions-button-container">
                        <div class="permissions-spacer" />
                        <Button
                            type="button"
                            variant="utility"
                            onClick={() => setShowDeleteConfirm(false)}
                        >
                            Cancel
                        </Button>
                        <Button type="button" variant="danger" onClick={confirmDelete}>
                            Delete
                        </Button>
                    </div>
                </form>
            </Dialog>

            <Dialog open={showError()} onOpenChange={setShowError} title="Error">
                <form onSubmit={(evt) => evt.preventDefault()}>
                    <p>{errorMessage()}</p>
                    <div class="permissions-button-container">
                        <div class="permissions-spacer" />
                        <Button type="button" variant="primary" onClick={() => setShowError(false)}>
                            OK
                        </Button>
                    </div>
                </form>
            </Dialog>
        </>
    );
}
