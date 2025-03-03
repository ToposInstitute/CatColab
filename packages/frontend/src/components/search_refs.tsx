import type { RefQueryParams, RefStub } from "catcolab-api";
import { For, Show, createResource, createSignal, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import type { Api } from "../api";
import "./search_refs.css";

export function SearchRefs(props: {
    endpoint: Api["rpc"]["get_ref_stubs"] | Api["rpc"]["get_ref_stubs_related_to_user"];
    onRefSelected: (stub: RefStub) => void;
    focusOnFirstRender: boolean;
    initialQuery: string | null;
    onCancel: () => void;
}) {
    const [query, setQuery] = createSignal<string | null>(props.initialQuery);
    const [isPopupOpen, setIsPopupOpen] = createSignal(false);
    const [latestRequestId, setLatestRequestId] = createSignal(0);
    const [inputRef, setInputRef] = createSignal<HTMLInputElement | null>(null);
    const [popupPosition, setPopupPosition] = createSignal({ top: 0, left: 0, width: 0 });
    const [selectedIndex, setSelectedIndex] = createSignal<number | null>(null);
    const [errorMessage, setErrorMessage] = createSignal<string | null>(null);

    if (props.focusOnFirstRender) {
        onMount(() => {
            setTimeout(() => {
                if (inputRef()) {
                    console.log("focus");
                    inputRef()?.focus();
                }
            }, 0); // Let ProseMirror fully render first
        });
    }

    // Close the popup when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
        if (!inputRef()?.contains(event.target as Node)) {
            setIsPopupOpen(false);
            setErrorMessage(null);
        }
    };
    document.addEventListener("click", handleClickOutside);
    onCleanup(() => document.removeEventListener("click", handleClickOutside));

    // Debounce function to reduce API calls on fast typing
    let debounceTimer: ReturnType<typeof setTimeout>;
    const updateQuery = (value: string) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            setQuery(value);
            updatePopupPosition();
            setIsPopupOpen(true);
            setSelectedIndex(null); // Reset selection when typing
            setErrorMessage(null);
        }, 300);
    };

    // Update popup position relative to input field
    const updatePopupPosition = () => {
        const input = inputRef();
        if (input) {
            const rect = input.getBoundingClientRect();
            setPopupPosition({
                top: rect.bottom + window.scrollY,
                left: rect.left + window.scrollX,
                width: rect.width,
            });
        }
    };

    // Fetch function (called by createResource)
    const fetchResults = async () => {
        if (query() === null) return [];

        const requestId = latestRequestId() + 1;
        setLatestRequestId(requestId);

        const queryParams: RefQueryParams = {
            owner_username_query: null,
            ref_name_query: query() || "", // Allow empty query
        };

        try {
            const response = await props.endpoint.query(queryParams);
            if (requestId === latestRequestId()) {
                if (response.tag === "Ok") {
                    return response.content;
                } else {
                    setErrorMessage(`Error: ${response.message}`);
                }
            }
        } catch (err) {
            setErrorMessage("Failed to fetch results");
        }
        return [];
    };

    const [results] = createResource(query, fetchResults);

    // Handle keyboard navigation
    const handleKeyDown = (e: KeyboardEvent) => {
        if (!isPopupOpen()) return;

        const items = results() || [];

        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (items.length === 0) return;
            setSelectedIndex((prev) => (prev === null || prev >= items.length - 1 ? 0 : prev + 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (items.length === 0) return;
            setSelectedIndex((prev) => (prev === null || prev <= 0 ? items.length - 1 : prev - 1));
        } else if (e.key === "Enter") {
            e.preventDefault();

            // TODO: if enter is pressed while there is a pending request selects the item from the stale list
            const index = selectedIndex() || 0;
            const refStub = items[index];
            if (!refStub) {
                setErrorMessage("No results found.");
                console.log("setting error msg");
                return;
            }

            setIsPopupOpen(false);
            props.onRefSelected(refStub);
        }
    };

    return (
        <>
            <div class="search-container">
                <input
                    ref={setInputRef}
                    type="text"
                    onInput={(e) => updateQuery(e.currentTarget.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={props.onCancel}
                    class="search-input"
                    placeholder="Search..."
                />
            </div>

            {/* Portal for popup */}
            <Portal>
                <Show when={isPopupOpen() || errorMessage() !== null}>
                    <div
                        class="search-popup"
                        style={{
                            position: "absolute",
                            top: `${popupPosition().top}px`,
                            left: `${popupPosition().left}px`,
                            width: `${popupPosition().width}px`,
                        }}
                    >
                        <For each={results()}>
                            {(stub, index) => (
                                <div
                                    class={`search-item ${selectedIndex() === index() ? "selected" : ""}`}
                                    onClick={() => {
                                        props.onRefSelected(stub);
                                        setIsPopupOpen(false);
                                    }}
                                >
                                    {stub.name}
                                </div>
                            )}
                        </For>
                        <Show when={errorMessage()}>
                            <div class="search-error">{errorMessage()}</div>
                        </Show>
                    </div>
                </Show>
            </Portal>
        </>
    );
}
