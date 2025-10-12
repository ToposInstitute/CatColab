import ChartSpline from "lucide-solid/icons/chart-spline";
import File from "lucide-solid/icons/file";
import Network from "lucide-solid/icons/network";

import type { Document } from "catlog-wasm";
import { assertExhaustive } from "./assert_exhaustive";

export function DocumentTypeIcon(props: { documentType: Document["type"] }) {
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
