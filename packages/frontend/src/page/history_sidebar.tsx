import { HistoryNavigator } from "catcolab-ui-components";
import { type SnapshotHistory, useSnapshotHistory } from "./use_snapshot_history";

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
            undoTooltip="Undo"
            redoTooltip="Redo"
        />
    );
}
