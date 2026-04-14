import Redo2 from "lucide-solid/icons/redo-2";
import Undo2 from "lucide-solid/icons/undo-2";
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";

import { IconButton } from "./icon_button";
import { RelativeTime } from "./relative_time";
import { createVirtualList } from "./virtual_list";

import styles from "./history_navigator.module.css";

export type HistoryItem = {
    id: string;
    createdAt: number;
    active: boolean;
};

export type HistoryNavigatorProps = {
    /** History entries, newest-first, already linearized by caller. */
    items: HistoryItem[];
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onSelect: (id: string) => void;
    /** Tooltip for the undo button. Defaults to "Undo". */
    undoTooltip?: string;
    /** Tooltip for the redo button. Defaults to "Redo". */
    redoTooltip?: string;
};

const ROW_HEIGHT = 44;

/** Panel for navigating document snapshot history with undo/redo and a scrollable list. */
export function HistoryNavigator(props: HistoryNavigatorProps) {
    // Optimistic selection: when the user clicks a row, we immediately show
    // the dot there before the parent has had a chance to update `items`.
    const [optimisticId, setOptimisticId] = createSignal<string | null>(null);

    // Clear optimistic override whenever the upstream active item changes.
    createEffect(() => {
        void props.items.find((it) => it.active)?.id;
        setOptimisticId(null);
    });

    const displayItems = createMemo(() => {
        const pending = optimisticId();
        const raw = props.items.map((item) => ({
            ...item,
            minuteKey: Math.floor(item.createdAt / 60_000),
        }));

        const countPerMinute = new Map<number, number>();
        for (const item of raw) {
            countPerMinute.set(item.minuteKey, (countPerMinute.get(item.minuteKey) ?? 0) + 1);
        }

        const indexPerMinute = new Map<number, number>();
        const suffixByIndex = new Map<number, string>();
        for (let i = raw.length - 1; i >= 0; i--) {
            const item = raw[i];
            if (!item) {
                continue;
            }
            const total = countPerMinute.get(item.minuteKey) ?? 1;
            if (total > 1) {
                const idx = (indexPerMinute.get(item.minuteKey) ?? 0) + 1;
                indexPerMinute.set(item.minuteKey, idx);
                if (idx >= 2) {
                    suffixByIndex.set(i, `~${idx}`);
                }
            }
        }

        return raw.map((item, i) => {
            const isActive = pending != null ? item.id === pending : item.active;
            return {
                id: item.id,
                active: isActive,
                createdAt: item.createdAt,
                suffix: suffixByIndex.get(i) ?? null,
            };
        });
    });

    const activeIndex = createMemo(() => {
        const items = displayItems();
        for (let i = 0; i < items.length; i++) {
            if (items[i]?.active) {
                return i;
            }
        }
        return -1;
    });

    const [scrollHeight, setScrollHeight] = createSignal(300);

    const [virtualList, onScroll] = createVirtualList({
        items: displayItems,
        rootHeight: scrollHeight,
        rowHeight: () => ROW_HEIGHT,
        overscanCount: 5,
    });

    let scrollContainerEl: HTMLDivElement | undefined;

    const containerRef = (el: HTMLDivElement) => {
        scrollContainerEl = el;
        const measure = () => setScrollHeight(el.clientHeight);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
    };

    createEffect(() => {
        const idx = activeIndex();
        const el = scrollContainerEl;
        if (!el || idx < 0) {
            return;
        }

        const rowTop = idx * ROW_HEIGHT;
        const rowBottom = rowTop + ROW_HEIGHT;
        const viewTop = el.scrollTop;
        const viewBottom = viewTop + el.clientHeight;

        if (rowTop < viewTop) {
            el.scrollTop = rowTop;
        } else if (rowBottom > viewBottom) {
            el.scrollTop = rowBottom - el.clientHeight;
        }
    });

    return (
        <div class={styles.panel}>
            <div class={styles.toolbar}>
                <IconButton
                    onClick={() => {
                        const idx = activeIndex();
                        const items = displayItems();
                        const next = items[idx + 1];
                        if (next) {
                            setOptimisticId(next.id);
                        }
                        props.onUndo();
                    }}
                    disabled={!props.canUndo}
                    tooltip={props.undoTooltip ?? "Undo"}
                >
                    <Undo2 size={24} />
                </IconButton>
                <IconButton
                    onClick={() => {
                        const idx = activeIndex();
                        const items = displayItems();
                        const prev = items[idx - 1];
                        if (prev) {
                            setOptimisticId(prev.id);
                        }
                        props.onRedo();
                    }}
                    disabled={!props.canRedo}
                    tooltip={props.redoTooltip ?? "Redo"}
                >
                    <Redo2 size={24} />
                </IconButton>
            </div>
            <div class={styles.scrollContainer} ref={containerRef} onScroll={onScroll}>
                <div
                    style={{
                        position: "relative",
                        width: "100%",
                        height: `${virtualList().containerHeight}px`,
                    }}
                >
                    <div
                        style={{
                            position: "absolute",
                            top: `${virtualList().viewerTop}px`,
                            width: "100%",
                        }}
                    >
                        <For each={virtualList().visibleItems}>
                            {(item) => (
                                <button
                                    type="button"
                                    class={styles.row}
                                    style={{ height: `${ROW_HEIGHT}px` }}
                                    onClick={() => {
                                        setOptimisticId(item.id);
                                        props.onSelect(item.id);
                                    }}
                                >
                                    <span class={styles.dotSlot} aria-hidden="true">
                                        <Show when={item.active}>
                                            <span class={styles.selectionDot} />
                                        </Show>
                                    </span>
                                    <span class={styles.timeCell}>
                                        <span class={styles.timestamp}>
                                            <RelativeTime timestamp={item.createdAt} />
                                        </span>
                                        <Show when={item.suffix}>
                                            <span class={styles.suffix}>{item.suffix}</span>
                                        </Show>
                                    </span>
                                </button>
                            )}
                        </For>
                    </div>
                </div>
            </div>
        </div>
    );
}
