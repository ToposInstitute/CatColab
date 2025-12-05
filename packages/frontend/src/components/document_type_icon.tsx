import ChartSpline from "lucide-solid/icons/chart-spline";
import File from "lucide-solid/icons/file";
import FileX from "lucide-solid/icons/file-x";
import Network from "lucide-solid/icons/network";
import { Match, Switch } from "solid-js";

import type { DocumentType } from "../api";

export function DocumentTypeIcon(props: { documentType: DocumentType; isDeleted?: boolean }) {
    return (
        <Switch fallback={<File />}>
            <Match when={props.isDeleted}>
                <FileX style={{ color: "darkgray" }} />
            </Match>
            <Match when={props.documentType === "model"}>
                <File />
            </Match>
            <Match when={props.documentType === "diagram"}>
                <Network />
            </Match>
            <Match when={props.documentType === "analysis"}>
                <ChartSpline />
            </Match>
        </Switch>
    );
}
