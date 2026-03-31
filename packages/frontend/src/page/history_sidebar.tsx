import { HistoryNavigator } from "catcolab-ui-components";

import { type SnapshotHistory, useSnapshotHistory } from "./use_snapshot_history";

export function HistorySidebar(props: { refId: string; history?: SnapshotHistory }) {
    const history = props.history ?? useSnapshotHistory(() => props.refId);

    return (
        <HistoryNavigator
            items={history.items()}
            canUndo={history.canUndo()}
            canRedo={history.canRedo()}
            onUndo={history.onUndo}
            onRedo={history.onRedo}
            onSelect={history.navigate}
        />
    );
}
