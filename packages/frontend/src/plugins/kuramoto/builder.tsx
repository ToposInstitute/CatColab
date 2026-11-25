import type { ModelAnalysisBuilder, ModelAnalysisProps } from "../../analysis";
import { type KuramotoProblemData, type KuramotoSimulator, newKuramotoProblemData } from "./types";

export function loadKuramotoAnalysis(args: {
    loadSimulator: () => Promise<KuramotoSimulator>;
    couplingLabel?: string;
    dampingLabel?: string;
    forcingLabel?: string;
}): () => Promise<ModelAnalysisBuilder<KuramotoProblemData>> {
    return async () => {
        const simulate = await args.loadSimulator();
        const Kuramoto = (await import("./kuramoto")).default;
        return {
            contentVersion: 0,
            initialContent: newKuramotoProblemData,
            component: (props: ModelAnalysisProps<KuramotoProblemData>) => (
                <Kuramoto
                    simulate={simulate}
                    couplingLabel={args.couplingLabel}
                    dampingLabel={args.dampingLabel}
                    forcingLabel={args.forcingLabel}
                    {...props}
                />
            ),
        };
    };
}
