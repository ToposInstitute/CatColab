import download from "js-file-download";
import CircleHelp from "lucide-solid/icons/circle-help";
import Copy from "lucide-solid/icons/copy";
import Download from "lucide-solid/icons/download";

import { IconButton } from "catcolab-ui-components";

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

// TODO this was factored out of sql.tsx since the lucide icons are expecting the browser API to be available.
export function SqlHeader(sql: string) {
    return (
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
}
