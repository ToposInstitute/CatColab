import { createSignal, For, Show } from "solid-js";

import { BlockTitle } from "catcolab-ui-components";
import { ThSchema } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import { SqlHeader } from "../../components";

export enum SqlBackend {
    MySQL = "MySQL",
    SQLite = "SQLite",
    PostgresSQL = "PostgresSQL",
}

/** Component to interface with SQL analysis. Allows user to download the script and change the backend. */
export default function SqlSchemaInterface(props: ModelAnalysisProps<DownloadConfig>) {
    const thSchema = new ThSchema();

    const [backend, setBackend] = createSignal(SqlBackend.MySQL);
    const sqlOutput = () => {
        const model = props.liveModel.elaboratedModel();
        return model ? thSchema.renderSql(model, backend()) : null;
    };

    const BackendConfig = () => (
        <div>
            <span>Backend: </span>
            <select
                value={backend() ?? undefined}
                onInput={(evt) =>
                    props.changeContent((content) => {
                        setBackend(evt.currentTarget.value as SqlBackend);
                        content.backend = backend();
                    })
                }
            >
                <For each={Object.values(SqlBackend)}>
                    {(bknd) => <option value={bknd}>{bknd}</option>}
                </For>
            </select>
        </div>
    );

    const title = () => "SQL Schema";

    return (
        <div>
            <Show when={sqlOutput()}>
                {(sql) => (
                    <div>
                        <BlockTitle
                            title={title()}
                            actions={SqlHeader(sql())}
                            settingsPane={BackendConfig()}
                        />
                        <pre>{sql()}</pre>
                    </div>
                )}
            </Show>
        </div>
    );
}

export type DownloadConfig = {
    backend: SqlBackend;
    filename: string;
};
