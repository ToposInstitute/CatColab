// import type { JSX } from "solid-js";

import Popover from "@corvu/popover";
import download from "js-file-download";
import CircleHelp from "lucide-solid/icons/circle-help";
import Download from "lucide-solid/icons/download";
import { createSignal, Show } from "solid-js";

import { ThSchema } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import { IconButton } from "catcolab-ui-components";
import { MenuItem, MenuItemLabel } from "../../page";

/** Button to download an SVG. */
export default function DownloadTextButton(props: ModelAnalysisProps<DownloadConfig>) {
    const thSchema = new ThSchema();

    // TODO SQLite can be an invalid change
    const [backend, setBackend] = createSignal("MySQL");
    const sqlOutput = () => {
        const model = props.liveModel.elaboratedModel();
        return model ? thSchema.renderSql(model, backend()) : null;
    };
    const downloadText = (text: string) => {
        downloadTextContent(
            text,
            // props.filename ??
            "schema.sql",
        );
        // TODO get the name of analysis
    };

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

    return (
        <div>
            <Show when={sqlOutput()}>
                {(sql) => (
                    <div>
                        <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-bottom: 8px;">
                            <Popover>
                                <Popover.Trigger as={IconButton}>
									<span>{backend()}</span>
								</Popover.Trigger>
                                <Popover.Portal>
                                    <Popover.Content class="menu popup">
                                        <MenuItem onSelect={() => setBackend("MySQL")}>
                                            <MenuItemLabel>{"MySQL"}</MenuItemLabel>
                                        </MenuItem>
                                        <MenuItem onSelect={() => setBackend("SQLite")}>
                                            <MenuItemLabel>{"SQLite"}</MenuItemLabel>
                                        </MenuItem>
                                        <MenuItem onSelect={() => setBackend("PostgresSQL")}>
                                            <MenuItemLabel>{"PostgresSQL"}</MenuItemLabel>
                                        </MenuItem>
                                    </Popover.Content>
                                </Popover.Portal>
                            </Popover>

                            <IconButton
                                onClick={() => downloadText(sql())}
                                disabled={false}
                                tooltip={""}
                            >
                                <Download size={16} />
                            </IconButton>
                            <IconButton tooltip={tooltip()}>
                                <CircleHelp size={16} />
                            </IconButton>
                        </div>
                        <pre style="white-space: pre-wrap;">{sql()}</pre>
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
