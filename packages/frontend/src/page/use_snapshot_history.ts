import { type Accessor, createMemo } from "solid-js";

import type { HistoryItem } from "catcolab-ui-components";
import type { SnapshotInfo } from "catcolab-api/src/user_state";

import { useApi } from "../api";
import { useUserState } from "../user/user_state_context";

/** Walk backwards from `head` to root, then forward via newest children to the tip. */
function buildFullChain(
    head: string,
    snapshots: { [key: string]: SnapshotInfo | undefined },
): string[] {
    const backwards: string[] = [];
    let current: string | null = head;
    while (current != null && snapshots[current] != null) {
        backwards.push(current);
        const parent: number | null = snapshots[current]!.parent ?? null;
        current = parent != null ? String(parent) : null;
    }
    backwards.reverse();

    let tip: string | null = newestChild(head, snapshots);
    while (tip != null) {
        backwards.push(tip);
        tip = newestChild(tip, snapshots);
    }

    return backwards;
}

function newestChild(
    snapshotId: string,
    snapshots: { [key: string]: SnapshotInfo | undefined },
): string | null {
    let best: string | null = null;
    let bestTime = -Infinity;
    const numericId = Number.parseInt(snapshotId, 10);
    for (const [id, entry] of Object.entries(snapshots)) {
        if (entry != null && entry.parent === numericId && entry.createdAt > bestTime) {
            best = id;
            bestTime = entry.createdAt;
        }
    }
    return best;
}

function chainToItems(
    chain: string[],
    head: string,
    snapshots: { [key: string]: SnapshotInfo | undefined },
): HistoryItem[] {
    const items: HistoryItem[] = [];
    for (let i = chain.length - 1; i >= 0; i--) {
        const id = chain[i]!;
        const entry = snapshots[id];
        if (entry) {
            items.push({ id, createdAt: entry.createdAt, active: id === head });
        }
    }
    return items;
}

export type SnapshotHistory = {
    items: Accessor<HistoryItem[]>;
    canUndo: Accessor<boolean>;
    canRedo: Accessor<boolean>;
    onUndo: () => void;
    onRedo: () => void;
    navigate: (snapshotId: string) => void;
};

/** Reactive hook providing snapshot history navigation for a document ref. */
export function useSnapshotHistory(refId: Accessor<string>): SnapshotHistory {
    const api = useApi();
    const userState = useUserState();

    const docInfo = createMemo(() => userState.documents[refId()]);
    const head = createMemo(() => {
        const cs = docInfo()?.currentSnapshot;
        return cs != null ? String(cs) : "";
    });
    const snapshots = createMemo(() => docInfo()?.snapshots ?? {});

    const chain = createMemo(() => {
        const h = head();
        return h ? buildFullChain(h, snapshots()) : [];
    });

    const items = createMemo(() => chainToItems(chain(), head(), snapshots()));

    const currentIndex = createMemo(() => chain().indexOf(head()));
    const canUndo = createMemo(() => currentIndex() > 0);
    const canRedo = createMemo(() => newestChild(head(), snapshots()) != null);

    const navigate = (snapshotId: string) => {
        const id = Number.parseInt(snapshotId, 10);
        if (!Number.isNaN(id)) {
            void api.rpc.set_current_snapshot.mutate(refId(), id);
        }
    };

    const onUndo = () => {
        const idx = currentIndex();
        const prev = chain()[idx - 1];
        if (idx > 0 && prev != null) navigate(prev);
    };

    const onRedo = () => {
        const child = newestChild(head(), snapshots());
        if (child != null) navigate(child);
    };

    return { items, canUndo, canRedo, onUndo, onRedo, navigate };
}
