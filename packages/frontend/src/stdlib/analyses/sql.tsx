import download from "js-file-download";
import CircleHelp from "lucide-solid/icons/circle-help";
import Copy from "lucide-solid/icons/copy";
import Download from "lucide-solid/icons/download";
import { createSignal, For, Show } from "solid-js";

import { BlockTitle, IconButton } from "catcolab-ui-components";
import { ThSchema } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";

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

    const copyToClipboard = (text: string) => navigator.clipboard.writeText(text);

    const tooltip = () => (
        <>
            <p>
                {
                    "The following attribute types are parsed as the SQL type in ihe chosen dialect. Any other types will be parsed literally. For example, an Attribute Type 'CustomType' will be parsed as a type 'CustomType' independent of its dialect, whereas 'Int' will be parsed as 'integer' in SQLite and 'int' in MySQL"
                }
            </p>
            <ul>
                <li>{"Int"}</li>
                <li>{"TinyInt"}</li>
                <li>{"Float"}</li>
                <li>{"Bool"}</li>
                <li>{"Time"}</li>
                <li>{"Date"}</li>
                <li>{"DateTime"}</li>
            </ul>
        </>
    );

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
    const header = (sql: string) => (
        <div style="display: flex; align-items: center; justify-content: flex-end; gap: 4px;">
            <IconButton
                onClick={() => copyToClipboard(sql)}
                disabled={false}
                tooltip={"Copy SQL to clipboard"}
            >
                <Copy size={16} />
            </IconButton>
            <IconButton
                onClick={() => download(sql, "schema.sql", "text/plain")}
                disabled={false}
                tooltip={""}
            >
                <Download size={16} />
            </IconButton>
            <IconButton tooltip={tooltip()}>
                <CircleHelp size={16} />
            </IconButton>
        </div>
    );

    return (
        <div>
            <Show when={sqlOutput()}>
                {(sql) => (
                    <div>
                        <BlockTitle
                            title={title()}
                            actions={header(sql())}
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
