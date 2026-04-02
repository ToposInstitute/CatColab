import { HistoryNavigator } from "catcolab-ui-components";
import { type SnapshotHistory, useSnapshotHistory } from "./use_snapshot_history";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
const mod = isMac ? "\u2318" : "Ctrl";

export function HistorySidebar(props: { refId: string; history?: SnapshotHistory }) {
    const ownHistory = useSnapshotHistory(() => props.refId);
    const history = () => props.history ?? ownHistory;

    return (
        <HistoryNavigator
            items={history().items()}
            canUndo={history().canUndo()}
            canRedo={history().canRedo()}
            onUndo={history().onUndo}
            onRedo={history().onRedo}
            onSelect={history().navigate}
            undoTooltip={`Undo (${mod}+Z)`}
            redoTooltip={`Redo (${mod}+Shift+Z)`}
        />
    );
}
