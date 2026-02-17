import download from "js-file-download";
import CircleHelp from "lucide-solid/icons/circle-help";
import Copy from "lucide-solid/icons/copy";
import Download from "lucide-solid/icons/download";
import { For, Match, Show, Switch } from "solid-js";

import { BlockTitle, ErrorAlert, IconButton } from "catcolab-ui-components";
import type { ModelAnalysisProps } from "../../analysis";
import styles from "../styles.module.css";
import * as SQL from "./sql_types.ts";

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

export function SQLHeader(sql: string) {
    return (
        <div class={styles.headerContainer}>
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
}

/** Component to interface with SQL analysis. Allows user to download the script and change the backend. */
export default function SQLSchemaAnalysis(
    props: ModelAnalysisProps<DownloadConfig> & {
        render: SQL.SQLRenderer;
        title: string;
    },
) {
    const sql_script = () => {
        const model = props.liveModel.elaboratedModel();
        if (model) {
            return props.render(model, props.content.backend);
        }
    };

    const BackendConfig = () => (
        <div>
            <span>Backend: </span>
            <select
                value={props.content.backend}
                onInput={(evt) =>
                    props.changeContent((content) => {
                        content.backend = evt.currentTarget.value as SQL.SQLBackend;
                    })
                }
            >
                <For each={Object.values(SQL.SQLBackend)}>
                    {(bknd) => <option value={bknd}>{bknd}</option>}
                </For>
            </select>
        </div>
    );

    return (
        <div>
            <Show when={sql_script()}>
                {(result) => (
                    <Switch>
                        <Match when={result().tag === "Ok" && result().content}>
                            {(sql) => (
                                <div>
                                    <BlockTitle
                                        title={props.title}
                                        actions={SQLHeader(sql())}
                                        settingsPane={BackendConfig()}
                                    />
                                    <pre>{sql()}</pre>
                                </div>
                            )}
                        </Match>
                        <Match when={result().tag === "Err"}>
                            <div>
                                <BlockTitle title={props.title} settingsPane={BackendConfig()} />
                                <ErrorAlert>
                                    <p>{"The model failed to compile into a SQL script."}</p>
                                    <p>{"Check for cycles in foreign key constraints."}</p>
                                </ErrorAlert>
                            </div>
                        </Match>
                    </Switch>
                )}
            </Show>
        </div>
    );
}

export type DownloadConfig = {
    backend: SQL.SQLBackend;
    filename: string;
};
