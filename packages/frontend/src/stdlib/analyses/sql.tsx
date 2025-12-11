import download from "js-file-download";
import CircleHelp from "lucide-solid/icons/circle-help";
import Copy from "lucide-solid/icons/copy";
import Download from "lucide-solid/icons/download";
import { createSignal, For, Show } from "solid-js";

import { Foldable, IconButton } from "catcolab-ui-components";
import { ThSchema } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";

/** Button to download an SVG. */
export default function DownloadTextButton(props: ModelAnalysisProps<DownloadConfig>) {
    const thSchema = new ThSchema();

    const backends = ["MySQL", "SQLite", "PostgresSQL"];

    const [backend, setBackend] = createSignal("MySQL");
    const sqlOutput = () => {
        const model = props.liveModel.elaboratedModel();
        return model ? thSchema.renderSql(model, backend()) : null;
    };
    const downloadText = (text: string) => {
        downloadTextContent(text, "schema.sql");
        // TODO get the name of analysis
    };

    const copyToClipboard = (text: string) => navigator.clipboard.writeText(text);

    const tooltip = () => (
        <>
            <p>
                {
                    "The following attribute types are parsed as SQL types. Any others are parsed as text."
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

    const BackendConfig = (backends: string[]) => (
        <div>
            <span>Backend: </span>
            <select
                value={backend() ?? undefined}
                onInput={(evt) =>
                    props.changeContent((content) => {
                        setBackend(evt.currentTarget.value);
                        content.backend = backend();
                    })
                }
            >
                <For each={Array.from(backends)}>
                    {(bknd) => <option value={bknd}>{bknd}</option>}
                </For>
            </select>
        </div>
    );

    const title = () => "SQL Schema";
    const header = (sql: string) => (
        <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-bottom: 8px;">
            <IconButton
                onClick={() => copyToClipboard(sql)}
                disabled={false}
                tooltip={"Copy SQL to clipboard"}
            >
                <Copy size={16} />
            </IconButton>
            <IconButton onClick={() => downloadText(sql)} disabled={false} tooltip={""}>
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
                        <Foldable title={title()} header={header(sql())}>
                            {BackendConfig(backends)}
                        </Foldable>
                        <pre>{sql()}</pre>
                    </div>
                )}
            </Show>
        </div>
    );
}

export function downloadTextContent(text: string, filename: string) {
    return download(text, filename, "text/plain");
}

export type DownloadConfig = {
    backend: string;
    filename: string;
};

export const defaultDownloadConfig = (): DownloadConfig => ({
    backend: "MySQL",
    filename: "schema.sql",
});
