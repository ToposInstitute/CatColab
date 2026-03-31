import { createMemo, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { Button } from "./button";
import { HistoryNavigator, type HistoryItem } from "./history_navigator";

const meta = {
    title: "Misc/HistoryNavigator",
    component: HistoryNavigator,
} satisfies Meta<typeof HistoryNavigator>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Example history: a tree of ~20 snapshots.
//
// Timeline (minutes from start):
//   0   1 - 2 - 3 - 4 - 5 - 6 - 7 - 8 - 9 - 10
//                        \                      \
//                         11 - 12 - 13           19 - 20
//                                    \
//                                     14 - 15 - 16 - 17 - 18
//
// The "main" branch is 1..10, with side branches at 4 and 10.
// Forward navigation always picks the newest child.
// ---------------------------------------------------------------------------

type HistoryEntry = {
    createdAt: number;
    parent: string | null;
};

const BASE_TIME = Date.now() - 3 * 60 * 60 * 1000;
const INTERVAL = 10 * 60 * 1000;

function ts(index: number): number {
    return BASE_TIME + index * INTERVAL;
}

function entry(id: number, parent: number | null, timeIndex: number): [string, HistoryEntry] {
    return [
        String(id),
        {
            createdAt: ts(timeIndex),
            parent: parent != null ? String(parent) : null,
        },
    ];
}

const initialEntries: [string, HistoryEntry][] = [
    entry(1, null, 0),
    entry(2, 1, 1),
    entry(3, 2, 2),
    entry(4, 3, 3),
    entry(5, 4, 4),
    entry(6, 5, 5),
    entry(7, 6, 6),
    entry(8, 7, 7),
    entry(9, 8, 8),
    entry(10, 9, 9),
    entry(11, 4, 5.5),
    entry(12, 11, 6.5),
    entry(13, 12, 7.5),
    entry(14, 13, 8.5),
    entry(15, 14, 9.5),
    entry(16, 15, 10.5),
    entry(17, 16, 11.5),
    entry(18, 17, 12.5),
    entry(19, 10, 10.5),
    entry(20, 19, 11.5),
];

function makeInitialHistory(): Record<string, HistoryEntry> {
    return Object.fromEntries(initialEntries);
}

function newestChild(snapshotId: string, history: Record<string, HistoryEntry>): string | null {
    let best: string | null = null;
    let bestTime = -Infinity;
    for (const [id, e] of Object.entries(history)) {
        if (e.parent === snapshotId && e.createdAt > bestTime) {
            best = id;
            bestTime = e.createdAt;
        }
    }
    return best;
}

function buildFullChain(head: string, history: Record<string, HistoryEntry>): string[] {
    const backwards: string[] = [];
    let current: string | null = head;
    while (current != null && history[current] != null) {
        backwards.push(current);
        current = history[current]!.parent ?? null;
    }
    backwards.reverse();

    let tip: string | null = newestChild(head, history);
    while (tip != null) {
        backwards.push(tip);
        tip = newestChild(tip, history);
    }

    return backwards;
}

function chainToItems(
    chain: string[],
    head: string,
    history: Record<string, HistoryEntry>,
): HistoryItem[] {
    const items: HistoryItem[] = [];
    for (let i = chain.length - 1; i >= 0; i--) {
        const id = chain[i]!;
        const e = history[id];
        if (e) {
            items.push({ id, createdAt: e.createdAt, active: id === head });
        }
    }
    return items;
}

function InteractiveStory(props: { initialHead: string }) {
    const [head, setHead] = createSignal(props.initialHead);
    const [history, setHistory] = createSignal(makeInitialHistory());
    const [nextId, setNextId] = createSignal(21);

    const chain = createMemo(() => buildFullChain(head(), history()));
    const items = createMemo(() => chainToItems(chain(), head(), history()));

    const currentIndex = createMemo(() => chain().indexOf(head()));
    const canUndo = createMemo(() => currentIndex() > 0);
    const canRedo = createMemo(() => newestChild(head(), history()) != null);

    const onUndo = () => {
        const idx = currentIndex();
        const prev = chain()[idx - 1];
        if (idx > 0 && prev != null) setHead(prev);
    };

    const onRedo = () => {
        const child = newestChild(head(), history());
        if (child != null) setHead(child);
    };

    const simulateChange = () => {
        const id = nextId();
        const parentId = head();
        const newEntry: HistoryEntry = {
            createdAt: Date.now(),
            parent: parentId,
        };
        setHistory((prev) => ({ ...prev, [String(id)]: newEntry }));
        setHead(String(id));
        setNextId(id + 1);
    };

    return (
        <div
            style={{
                display: "flex",
                "flex-direction": "column",
                height: "600px",
                gap: "8px",
                "max-width": "260px",
            }}
        >
            <div>
                <Button onClick={simulateChange}>Simulate Change</Button>
            </div>
            <div
                style={{
                    flex: "1",
                    "min-height": "0",
                    border: "1px solid #ddd",
                    "border-radius": "4px",
                }}
            >
                <HistoryNavigator
                    items={items()}
                    canUndo={canUndo()}
                    canRedo={canRedo()}
                    onUndo={onUndo}
                    onRedo={onRedo}
                    onSelect={setHead}
                />
            </div>
        </div>
    );
}

export const Default: Story = {
    render: () => <InteractiveStory initialHead="10" />,
};
