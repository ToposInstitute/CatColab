import { type Accessor, createMemo, createSignal } from "solid-js";

/**
 * A reactive virtual list utility.
 *
 * Unlike `@solid-primitives/virtual`'s `createVirtualList`, this properly
 * tracks all accessor inputs (items, rootHeight, rowHeight) inside a memo so
 * the computed output updates when any of them change.
 */
export function createVirtualList<T>(config: {
    items: Accessor<readonly T[]>;
    rootHeight: Accessor<number>;
    rowHeight: Accessor<number>;
    overscanCount?: number;
}): [
    Accessor<{
        containerHeight: number;
        viewerTop: number;
        visibleItems: readonly T[];
    }>,
    onScroll: (e: Event) => void,
] {
    const overscan = config.overscanCount ?? 1;
    const [offset, setOffset] = createSignal(0);

    const virtualState = createMemo(() => {
        const allItems = config.items();
        const rh = config.rowHeight();
        const root = config.rootHeight();
        const scrollTop = offset();

        const firstIdx = Math.max(0, Math.floor(scrollTop / rh) - overscan);
        const lastIdx = Math.min(
            allItems.length,
            Math.floor(scrollTop / rh) + Math.ceil(root / rh) + overscan,
        );

        return {
            containerHeight: allItems.length * rh,
            viewerTop: firstIdx * rh,
            visibleItems: allItems.slice(firstIdx, lastIdx),
        };
    });

    const onScroll = (e: Event) => {
        const target = e.target as HTMLElement | null;
        if (target?.scrollTop !== undefined) {
            setOffset(target.scrollTop);
        }
    };

    return [virtualState, onScroll];
}
