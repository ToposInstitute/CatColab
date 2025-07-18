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

    // Sorting state for column reordering functionality
    const [sortColumn, setSortColumn] = createSignal<string | null>(null);
    const [sortDirection, setSortDirection] = createSignal<'asc' | 'desc'>('asc');

    let debounceTimer: ReturnType<typeof setTimeout>;
    const updateQuery = (value: string) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => setDebouncedQuery(value), 300);
        setSearchQuery(value);
        setPage(0);
    };

    // Handle column sorting - toggle direction if same column, otherwise set new column
    const handleSort = (column: string) => {
        if (sortColumn() === column) {
            setSortDirection(sortDirection() === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
        setPage(0); // Reset to first page when sorting changes
    };

    const [pageData, { refetch }] = createResource(
        () => [debouncedQuery(), page(), sortColumn(), sortDirection()] as const,
        async ([debouncedQueryValue, pageValue]) => {
            const results = await api.rpc.search_ref_stubs.query({
                ownerUsernameQuery: null,
                refNameQuery: debouncedQueryValue,
                includePublicDocuments: false,
                searcherMinLevel: null,
                limit: pageSize,
                offset: pageValue * pageSize,
                // TODO: Add sorting parameters to backend API when available
                // sortBy: sortCol,
                // sortDirection: sortDir,
            });

            return results;
        },
    );

    onMount(() => {
        setDebouncedQuery(""); // Trigger fetch on page load
    });

    // Sort the items client-side for now, until backend sorting is implemented
    const sortedItems = (items: RefStub[]) => {
        if (!sortColumn()) return items;
        
        return [...items].sort((a, b) => {
            let aVal: string | number;
            let bVal: string | number;
            
            switch (sortColumn()) {
                case 'type':
                    aVal = a.typeName;
                    bVal = b.typeName;
                    break;
                case 'name':
                    aVal = a.name;
                    bVal = b.name;
                    break;
                case 'owner':
                    // Handle owner sorting with null checks
                    aVal = a.owner?.username || 'public';
                    bVal = b.owner?.username || 'public';
                    break;
                case 'permissions':
                    aVal = a.permissionLevel;
                    bVal = b.permissionLevel;
                    break;
                case 'createdAt':
                    aVal = new Date(a.createdAt).getTime();
                    bVal = new Date(b.createdAt).getTime();
                    break;
                default:
                    return 0;
            }
            
            if (aVal < bVal) return sortDirection() === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortDirection() === 'asc' ? 1 : -1;
            return 0;
        });
    };

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
                                    <th 
                                        onClick={() => handleSort('type')} 
                                        class="sortable"
                                        title="Click to sort by type"
                                        style={{ width: "80px" }}
                                    >
                                        Type {sortColumn() === 'type' && (sortDirection() === 'asc' ? ' ↑' : ' ↓')}
                                    </th>
                                    <th 
                                        onClick={() => handleSort('name')} 
                                        class="sortable"
                                        title="Click to sort by name"
                                        style={{ width: "200px" }}
                                    >
                                        Name {sortColumn() === 'name' && (sortDirection() === 'asc' ? ' ↑' : ' ↓')}
                                    </th>
                                    <th 
                                        onClick={() => handleSort('owner')} 
                                        class="sortable"
                                        title="Click to sort by owner"
                                        style={{ width: "100px" }}
                                    >
                                        Owner {sortColumn() === 'owner' && (sortDirection() === 'asc' ? ' ↑' : ' ↓')}
                                    </th>
                                    <th 
                                        onClick={() => handleSort('permissions')} 
                                        class="sortable"
                                        title="Click to sort by permissions"
                                        style={{ width: "120px" }}
                                    >
                                        Permissions {sortColumn() === 'permissions' && (sortDirection() === 'asc' ? ' ↑' : ' ↓')}
                                    </th>
                                    <th 
                                        onClick={() => handleSort('createdAt')} 
                                        class="sortable"
                                        title="Click to sort by creation date"
                                        style={{ width: "120px" }}
                                    >
                                        Created At {sortColumn() === 'createdAt' && (sortDirection() === 'asc' ? ' ↑' : ' ↓')}
                                    </th>
                                    <th style={{ width: "80px" }}>Actions</th>
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
                                            however the docs don't specify which states cause `loading` to be
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
                                        const sorted = sortedItems(items);
                                        return (
                                            <DocumentRowsPagination
                                                items={sorted}
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
                {(stub) => <RefStubRow stub={stub} refetch={props.refetch} />}
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

function RefStubRow(props: { stub: RefStub; refetch: () => void }) {
    const firebaseApp = useFirebaseApp();
    const auth = getAuth(firebaseApp);
    const navigate = useNavigate();
    // const api = useApi(); //commented out for now

    // Rename functionality state
    const [isEditing, setIsEditing] = createSignal(false);
    const [newName, setNewName] = createSignal(props.stub.name);
    const [isDeleting, setIsDeleting] = createSignal(false);
    const [isRenaming, setIsRenaming] = createSignal(false);

    const owner = props.stub.owner;
    const hasOwner = owner !== null;
    const isOwner = hasOwner && auth.currentUser?.uid === owner?.id;
    // biome-ignore lint/style/noNonNullAssertion: type narrowing doesn't work for ternary statements
    const ownerName = hasOwner ? (isOwner ? "me" : owner!.username) : "public";

    const handleClick = () => {
        // Don't navigate if we're editing or performing actions
        if (!isEditing() && !isDeleting() && !isRenaming()) {
            navigate(`/${props.stub.typeName}/${props.stub.refId}`);
        }
    };

    // Handle document deletion with confirmation
    const handleDelete = async (e: Event) => {
        e.stopPropagation(); // Prevent navigation when clicking delete
        
        if (!confirm(`Are you sure you want to delete "${props.stub.name}"?`)) {
            return;
        }

        setIsDeleting(true);
        try {
            // TODO: Backend API for deleting documents is not yet implemented
            // The backend needs to add a delete_ref or remove_ref RPC method
            // Available methods from tests: new_ref, get_doc, head_snapshot, set_permissions, sign_up_or_sign_in
            
            // For now, show that the feature works in UI but backend is needed
            await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
            
            alert(`Delete functionality is implemented in UI but requires backend API. 
                   The backend needs to implement a 'delete_ref' or 'remove_ref' RPC method.
                   Available methods: new_ref, get_doc, head_snapshot, set_permissions`);
            
            // Uncomment when backend API is implemented:
            // const result = await api.rpc.delete_ref.mutate(props.stub.refId);
            // if (result.tag === "Ok") {
            //     props.refetch();
            // } else {
            //     throw new Error(result.message || "Delete failed");
            // }
        } catch (error) {
            console.error("Delete error:", error);
            alert(`Delete feature ready, waiting for backend API implementation`);
        } finally {
            setIsDeleting(false);
        }
    };

    // Handle document renaming with validation
    const handleRename = async () => {
        const trimmedName = newName().trim();
        
        // Don't rename if name is empty or unchanged
        if (!trimmedName || trimmedName === props.stub.name) {
            setIsEditing(false);
            setNewName(props.stub.name); // Reset to original name
            return;
        }

        setIsRenaming(true);
        try {
            // TODO: Backend API for updating document metadata is not yet implemented
            // The backend needs to add an update_ref_metadata or rename_ref RPC method
            // Available methods from tests: new_ref, get_doc, head_snapshot, set_permissions, sign_up_or_sign_in
            
            // For now, show that the feature works in UI but backend is needed
            await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
            
            alert(`Rename functionality is implemented in UI but requires backend API.
                   The backend needs to implement an 'update_ref_metadata' or 'rename_ref' RPC method.
                   UI change from "${props.stub.name}" to "${trimmedName}" would work once API exists.`);
            
            // Reset the editing state
            setIsEditing(false);
            setNewName(props.stub.name); // Reset to original name since we can't actually save
            
            // Uncomment when backend API is implemented:
            // const result = await api.rpc.update_ref_metadata.mutate({
            //     refId: props.stub.refId,
            //     name: trimmedName
            // });
            // if (result.tag === "Ok") {
            //     setIsEditing(false);
            //     props.refetch();
            // } else {
            //     throw new Error(result.message || "Rename failed");
            // }
        } catch (error) {
            console.error("Rename error:", error);
            alert(`Rename feature ready, waiting for backend API implementation`);
            setNewName(props.stub.name); // Reset on error
        } finally {
            setIsRenaming(false);
            setIsEditing(false);
        }
    };

    // Handle keyboard events for rename input
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleRename();
        } else if (e.key === 'Escape') {
            setIsEditing(false);
            setNewName(props.stub.name);
        }
    };

    return (
        <tr class="ref-stub-row" onClick={handleClick}>
            <td style={{ width: "80px" }}>{props.stub.typeName}</td>
            <td onClick={(e) => e.stopPropagation()} style={{ width: "200px" }}>
                {isEditing() ? (
                    <input
                        type="text"
                        value={newName()}
                        onInput={(e) => setNewName(e.currentTarget.value)}
                        onBlur={handleRename}
                        onKeyDown={handleKeyDown}
                        autofocus
                        disabled={isRenaming()}
                        class="rename-input"
                        title="Press Enter to save, Escape to cancel"
                    />
                ) : (
                    <span 
                        onDblClick={() => {
                            if (isOwner && !isDeleting() && !isRenaming()) {
                                setIsEditing(true);
                            }
                        }}
                        title={isOwner ? "Double-click to rename" : ""}
                        class={isOwner ? "renameable" : ""}
                    >
                        {props.stub.name}
                    </span>
                )}
            </td>
            <td style={{ width: "100px" }}>{ownerName}</td>
            <td style={{ width: "120px" }}>{props.stub.permissionLevel}</td>
            <td style={{ width: "120px" }}>
                {new Date(props.stub.createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                })}
            </td>
            <td onClick={(e) => e.stopPropagation()} style={{ width: "80px" }}>
                {isOwner && (
                    <button 
                        onClick={handleDelete}
                        disabled={isDeleting() || isRenaming() || isEditing()}
                        class="delete-btn"
                        title={isDeleting() ? "Deleting..." : "Delete document"}
                    >
                        {isDeleting() ? "Deleting..." : "Delete"}
                    </button>
                )}
            </td>
        </tr>
    );
}