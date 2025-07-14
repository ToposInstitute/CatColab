import type { MorDecl } from "catlog-wasm";
import type { ModelAnalysisProps } from "../analysis/types";

export function morNameOrDefault<T>(mor: MorDecl, props: ModelAnalysisProps<T>) {
    if (mor.name) {
        return mor.name;
    }

    const { dom, cod } = mor;
    if (dom?.tag !== "Basic" || cod?.tag !== "Basic") {
        return "";
    }

    const source = props.liveModel.objectIndex().map.get(dom.content);
    const target = props.liveModel.objectIndex().map.get(cod.content);
    if (source && target) {
        return `${source}→${target}`;
    }

    return "";
}
