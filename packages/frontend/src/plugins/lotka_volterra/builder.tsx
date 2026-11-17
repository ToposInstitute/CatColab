import type { ModelAnalysisBuilder, ModelAnalysisProps } from "../../analysis";
import {
    type LotkaVolterraProblemData,
    type LotkaVolterraSimulator,
    newLotkaVolterraProblemData,
} from "./types";

export function loadLotkaVolterraAnalysis(args: {
    loadSimulator: () => Promise<LotkaVolterraSimulator>;
}): () => Promise<ModelAnalysisBuilder<LotkaVolterraProblemData>> {
    return async () => {
        const simulate = await args.loadSimulator();
        const LotkaVolterra = (await import("./lotka_volterra")).default;
        return {
            contentVersion: 0,
            initialContent: newLotkaVolterraProblemData,
            component: (props: ModelAnalysisProps<LotkaVolterraProblemData>) => (
                <LotkaVolterra simulate={simulate} {...props} />
            ),
        };
    };
}
