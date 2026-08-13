import { createSignal } from "solid-js";
import { v7 } from "uuid";

import type { HistoryItem } from "catcolab-ui-components";

/**
 * A local, in-memory snapshot history for a single document, modelled to drive
 * the shared `HistoryNavigator` exactly as the frontend's server-backed snapshot
 * history does — but without a server.
 *
 * The frontend records a snapshot per synced change and navigates by asking the
 * backend to repoint the live document at a chosen snapshot. Here the document
 * lives entirely in memory (the plain store's handle *is* the document object),
 * so a "snapshot" is a deep copy of the document's dump and navigating is
 * restoring that copy back onto the live document in place — which fires the
 * document's own change notification and so re-renders every reactive consumer.
 *
 * The chain is linear: recording a new snapshot while not at the tip drops the
 * (now diverged) forward entries, matching ordinary undo/redo. Entries are held
 * oldest-first internally and surfaced newest-first as `HistoryItem[]`, as the
 * navigator expects.
 */
export type LocalHistory = {
    /** History entries newest-first, for the `HistoryNavigator`. */
    items: () => HistoryItem[];
    canUndo: () => boolean;
    canRedo: () => boolean;
    onUndo: () => void;
    onRedo: () => void;
    /** Navigate to the snapshot with the given id (restores it in place). */
    navigate: (id: string) => void;
    /**
     * Record the current document state as a new snapshot at the tip, *debounced*
     * so a rapid burst of edits (e.g. typing a name) coalesces into one entry
     * taken once edits pause. A no-op while a restore is in flight (so restoring
     * does not itself branch history) and when the state is identical to the
     * current snapshot.
     */
    record: () => void;
    /**
     * Record the current state immediately, bypassing the debounce — for the
     * initial seed, so there is always a snapshot to return to right away.
     */
    recordNow: (groupId?: string) => void;
    /** Group attached to the current entry when undo would cross it. */
    undoGroup: () => string | undefined;
    /** Group attached to the next entry when redo would cross it. */
    redoGroup: () => string | undefined;
};

type Entry<S> = {
    id: string;
    createdAt: number;
    snapshot: S;
    /** Links entries in different document histories into one logical change. */
    groupId?: string;
};

/**
 * The serializable form of a {@link LocalHistory}: its full snapshot chain
 * (oldest-first) and the index currently navigated to. This is exactly what is
 * persisted to (and restored from) storage so history survives a reload.
 */
export type PersistedHistory<Snapshot> = {
    entries: Entry<Snapshot>[];
    currentIndex: number;
};

/**
 * Build a {@link LocalHistory} over a document.
 *
 * @param capture  Take a deep, detached snapshot of the current document state.
 * @param restore  Write a snapshot back onto the live document in place.
 * @param equal    Whether two snapshots are equal, so identical consecutive
 *                 states are not recorded as separate entries.
 * @param initial  A previously {@link PersistedHistory} to resume from, so the
 *                 snapshot chain (and where in it we are) survives a reload.
 * @param onChange Called with the full {@link PersistedHistory} whenever the
 *                 chain or the current index changes, so the host can persist it.
 */
export function createLocalHistory<Snapshot>(opts: {
    capture: () => Snapshot;
    restore: (snapshot: Snapshot) => void;
    equal: (a: Snapshot, b: Snapshot) => boolean;
    initial?: PersistedHistory<Snapshot>;
    onChange?: (state: PersistedHistory<Snapshot>) => void;
}): LocalHistory {
    const [entries, setEntries] = createSignal<Entry<Snapshot>[]>(opts.initial?.entries ?? []);
    const [currentIndex, setCurrentIndex] = createSignal(
        opts.initial ? opts.initial.currentIndex : -1,
    );

    /** Persist the current chain + index through the host's `onChange`, if any. */
    const persist = () => {
        opts.onChange?.({ entries: entries(), currentIndex: currentIndex() });
    };
    // Set while a restore is applying, so the change it provokes is not recorded
    // as a fresh snapshot (which would branch history on every navigation).
    let restoring = false;

    /** How long a burst of edits is coalesced into one snapshot, in ms. */
    const DEBOUNCE_MS = 500;
    // Pending debounced snapshot, if any: a rapid run of edits (e.g. typing a
    // name character by character) is collapsed into a single entry taken once
    // edits pause for `DEBOUNCE_MS`.
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    const recordNow = (groupId?: string) => {
        if (restoring) {
            return;
        }
        if (debounceTimer !== undefined) {
            clearTimeout(debounceTimer);
            debounceTimer = undefined;
        }
        const snapshot = opts.capture();
        const idx = currentIndex();
        const chain = entries();
        const current = chain[idx];
        if (current && opts.equal(current.snapshot, snapshot)) {
            return;
        }
        // Drop any forward (redo) entries: a new edit diverges from them.
        const kept = chain.slice(0, idx + 1);
        const entry: Entry<Snapshot> = {
            id: v7(),
            createdAt: Date.now(),
            snapshot,
            ...(groupId ? { groupId } : {}),
        };
        setEntries([...kept, entry]);
        setCurrentIndex(kept.length);
        persist();
    };

    const record = () => {
        // Never record while restoring — and drop any timer a prior edit armed,
        // so a restore mid-burst does not later snapshot the restored state.
        if (restoring) {
            if (debounceTimer !== undefined) {
                clearTimeout(debounceTimer);
                debounceTimer = undefined;
            }
            return;
        }
        if (debounceTimer !== undefined) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
            debounceTimer = undefined;
            recordNow();
        }, DEBOUNCE_MS);
    };

    const navigate = (id: string) => {
        const chain = entries();
        const idx = chain.findIndex((e) => e.id === id);
        if (idx < 0 || idx === currentIndex()) {
            return;
        }
        const entry = chain[idx];
        if (!entry) {
            return;
        }
        restoring = true;
        try {
            opts.restore(entry.snapshot);
        } finally {
            restoring = false;
        }
        setCurrentIndex(idx);
        persist();
    };

    const items = (): HistoryItem[] => {
        const chain = entries();
        const idx = currentIndex();
        // Newest-first, as the navigator expects.
        return chain
            .map((entry, i) => ({
                id: entry.id,
                createdAt: entry.createdAt,
                active: i === idx,
            }))
            .toReversed();
    };

    const canUndo = () => currentIndex() > 0;
    const canRedo = () => currentIndex() < entries().length - 1;
    const undoGroup = () => entries()[currentIndex()]?.groupId;
    const redoGroup = () => entries()[currentIndex() + 1]?.groupId;

    const onUndo = () => {
        const idx = currentIndex();
        if (idx > 0) {
            const prev = entries()[idx - 1];
            if (prev) {
                navigate(prev.id);
            }
        }
    };

    const onRedo = () => {
        const idx = currentIndex();
        const next = entries()[idx + 1];
        if (next) {
            navigate(next.id);
        }
    };

    return {
        items,
        canUndo,
        canRedo,
        onUndo,
        onRedo,
        navigate,
        record,
        recordNow,
        undoGroup,
        redoGroup,
    };
}

/**
 * Present one document history while coordinating entries explicitly grouped
 * with an entry in another history. Ordinary edits remain panel-local; crossing
 * a grouped migration checkpoint moves both histories together.
 */
export function pairHistories(primary: LocalHistory, peer: LocalHistory): LocalHistory {
    const onUndo = () => {
        const group = primary.undoGroup();
        if (group !== undefined && peer.undoGroup() === group) {
            primary.onUndo();
            peer.onUndo();
        } else {
            primary.onUndo();
        }
    };

    const onRedo = () => {
        const group = primary.redoGroup();
        if (group !== undefined && peer.redoGroup() === group) {
            primary.onRedo();
            peer.onRedo();
        } else {
            primary.onRedo();
        }
    };

    // HistoryNavigator permits jumping directly to any snapshot. Walk there one
    // entry at a time so every grouped boundary receives the same treatment as
    // the undo/redo buttons.
    const navigate = (id: string) => {
        for (;;) {
            const items = primary.items();
            const activeIndex = items.findIndex((item) => item.active);
            const targetIndex = items.findIndex((item) => item.id === id);
            if (activeIndex < 0 || targetIndex < 0 || activeIndex === targetIndex) {
                return;
            }
            if (activeIndex < targetIndex) {
                onUndo();
            } else {
                onRedo();
            }
        }
    };

    return {
        items: primary.items,
        canUndo: primary.canUndo,
        canRedo: primary.canRedo,
        onUndo,
        onRedo,
        navigate,
        record: primary.record,
        recordNow: primary.recordNow,
        undoGroup: primary.undoGroup,
        redoGroup: primary.redoGroup,
    };
}
