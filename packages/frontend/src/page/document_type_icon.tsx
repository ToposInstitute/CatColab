import ChartSpline from "lucide-solid/icons/chart-spline";
import File from "lucide-solid/icons/file";
import FileX from "lucide-solid/icons/file-x";
import Network from "lucide-solid/icons/network";

import type { DocumentType } from "../api";
import { assertExhaustive } from "../util/assert_exhaustive";

export function DocumentTypeIcon(props: { documentType: DocumentType; isDeleted?: boolean }) {
    if (props.isDeleted) {
        return <FileX style={{ color: "darkgray" }} />;
    }

    switch (props.documentType) {
        case "model":
            return <File />;
        case "diagram":
            return <Network />;
        case "analysis":
            return <ChartSpline />;
        default:
            assertExhaustive(props.documentType);
    }
}
