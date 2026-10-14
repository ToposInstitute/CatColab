import { createResizeObserver } from "@solid-primitives/resize-observer";
import {
    type Accessor,
    batch,
    createContext,
    createEffect,
    createSignal,
    onCleanup,
    onMount,
} from "solid-js";

import type { TableRow } from "catcolab-documents";
import { createVirtualList } from "../virtual_list";

/** Body-row pitch: 28px cell height + 1px collapsed border in table_editor.module.css. */
export const ROW_HEIGHT = 29;
/** Header estimate before measurement, matching the CSS height plus collapsed border. */
const INITIAL_HEADER_HEIGHT = 29;
/** Temporary viewport estimate until mount/resize measurement supplies the actual height. */
const INITIAL_VIEWPORT_HEIGHT = 300;
/** Render five extra rows on each side to buffer scrolling before the next update. */
const OVERSCAN = 5;
/** Ignore subpixel scroll/size rounding differences when showing overflow indicators. */
const SCROLL_EDGE_TOLERANCE = 1;

export const ViewportContext = createContext<ReturnType<typeof createTableViewport>>();

/** Geometry and scrolling only; selection and drafts remain in their controllers. */
export function createTableViewport(rows: Accessor<ReadonlyArray<TableRow>>) {
    const [area, setArea] = createSignal<HTMLDivElement>();
    const [head, setHead] = createSignal<HTMLTableSectionElement>();
    const [table, setTable] = createSignal<HTMLTableElement>();
    const [height, setHeight] = createSignal(INITIAL_VIEWPORT_HEIGHT);
    const [headerHeight, setHeaderHeight] = createSignal(INITIAL_HEADER_HEIGHT);
    // Focus parked on the container must not jump back when a selected row remounts.
    const [parked, setParked] = createSignal(false);
    const [edges, setEdges] = createSignal({
        top: false,
        bottom: false,
        left: false,
        right: false,
        width: 0,
        height: 0,
    });
    const [virtual, virtualScroll] = createVirtualList({
        items: rows,
        rootHeight: height,
        rowHeight: () => ROW_HEIGHT,
        overscanCount: OVERSCAN,
    });
    let disposed = false;
    onCleanup(() => {
        disposed = true;
    });

    const sync = () => {
        const el = area();
        if (!el) {
            return;
        }
        virtualScroll({ target: el });
        setEdges({
            top: el.scrollTop > SCROLL_EDGE_TOLERANCE,
            bottom: el.scrollHeight - el.clientHeight - el.scrollTop > SCROLL_EDGE_TOLERANCE,
            left: el.scrollLeft > SCROLL_EDGE_TOLERANCE,
            right: el.scrollWidth - el.clientWidth - el.scrollLeft > SCROLL_EDGE_TOLERANCE,
            width: el.clientWidth,
            height: el.clientHeight,
        });
    };
    let lastGeometry = "";
    const measure = () =>
        batch(() => {
            const el = area();
            if (!el || disposed) {
                return;
            }
            const hh = head()?.getBoundingClientRect().height ?? INITIAL_HEADER_HEIGHT;
            const geometry = `${el.clientWidth}:${el.clientHeight}:${hh}`;
            const changed = geometry !== lastGeometry;
            lastGeometry = geometry;
            setHeaderHeight(hh);
            const available = Math.max(0, el.clientHeight - hh);
            setHeight(available);
            // A stale spacer must not keep overflow alive after the data shrinks.
            el.scrollTop = Math.min(
                el.scrollTop,
                Math.max(0, rows().length * ROW_HEIGHT - available),
            );
            const focused = document.activeElement;
            const active = focused?.getAttribute("aria-activedescendant")
                ? document.getElementById(focused.getAttribute("aria-activedescendant")!)
                : focused;
            const row = active?.closest("tr[aria-rowindex]");
            if (changed && !parked() && active && el.contains(active) && row) {
                // Undo one-based ARIA indexing and the column header row.
                revealRow(Number(row.getAttribute("aria-rowindex")) - 2);
                const cell = active.closest("td");
                if (cell) {
                    revealCell(cell);
                }
            }
            sync();
        });
    createResizeObserver(
        () => [area(), head(), table()].filter((el): el is NonNullable<typeof el> => !!el),
        measure,
    );
    onMount(() => measure());
    createEffect(() => {
        rows();
        queueMicrotask(measure);
    });

    const revealRow = (index: number) => {
        const el = area();
        if (!el || index < 0) {
            return;
        }
        setParked(false);
        const top = index * ROW_HEIGHT;
        const bottom = top + ROW_HEIGHT;
        const available = Math.max(ROW_HEIGHT, el.clientHeight - headerHeight());
        if (top < el.scrollTop) {
            el.scrollTop = top;
        } else if (bottom > el.scrollTop + available) {
            el.scrollTop = bottom - available;
        }
        sync();
    };
    const revealCell = (cell: HTMLElement) => {
        const el = area();
        if (!el) {
            return;
        }
        const bounds = cell.getBoundingClientRect();
        const left = el.getBoundingClientRect().left + el.clientLeft;
        if (bounds.left < left) {
            el.scrollLeft -= left - bounds.left;
        } else if (bounds.right > left + el.clientWidth) {
            el.scrollLeft += bounds.right - left - el.clientWidth;
        }
        sync();
    };
    const scroll = () =>
        batch(() => {
            const el = area();
            if (!el) {
                return;
            }
            const active = document.activeElement;
            const row = active?.closest("tr[aria-rowindex]");
            // Undo one-based ARIA indexing and the column header row.
            const index = row ? Number(row.getAttribute("aria-rowindex")) - 2 : -1;
            const first = Math.max(0, Math.floor(el.scrollTop / ROW_HEIGHT) - OVERSCAN);
            const last =
                Math.floor(el.scrollTop / ROW_HEIGHT) + Math.ceil(height() / ROW_HEIGHT) + OVERSCAN;
            if (active && el.contains(active) && index >= 0 && (index < first || index >= last)) {
                setParked(true);
                // Blur commits before Index slots change their identities.
                el.focus({ preventScroll: true });
            }
            sync();
        });
    return {
        area,
        setArea,
        setHead,
        setTable,
        virtual,
        headerHeight,
        edges,
        parked,
        revealRow,
        revealCell,
        scroll,
    };
}
