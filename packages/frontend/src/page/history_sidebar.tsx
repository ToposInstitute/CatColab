import { HistoryNavigator } from "catcolab-ui-components";
import type { SnapshotHistory } from "./use_snapshot_history";

export function HistorySidebar(props: { history: SnapshotHistory }) {
    return (
        <HistoryNavigator
            items={props.history.items()}
            canUndo={props.history.canUndo()}
            canRedo={props.history.canRedo()}
            onUndo={props.history.onUndo}
            onRedo={props.history.onRedo}
            onSelect={props.history.navigate}
            undoTooltip="Undo"
            redoTooltip="Redo"
        />
    );
}
