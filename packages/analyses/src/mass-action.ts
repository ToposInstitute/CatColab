import { defineAnalysis } from "catcolab-documents";
import type {
    DblModel,
    ThSymMonoidalCategory,
    MassActionProblemData,
    ODEResultWithEquations,
} from "catlog-wasm";

let thSymMonoidalCategory: Promise<ThSymMonoidalCategory> | undefined;
function getCachedTheory(): Promise<ThSymMonoidalCategory> {
    thSymMonoidalCategory ??= import("catlog-wasm").then(
        ({ ThSymMonoidalCategory }) => new ThSymMonoidalCategory(),
    );
    return thSymMonoidalCategory;
}

export const MassActionDynamics = defineAnalysis({
    id: "mass-action",
    getInitialParams: (): MassActionProblemData => ({
        massConservationType: { type: "Balanced" },
        rates: {},
        transitionProductionRates: {},
        transitionConsumptionRates: {},
        placeProductionRates: {},
        placeConsumptionRates: {},
        initialValues: {},
        duration: 10,
    }),
    run: async (
        model: DblModel,
        params: MassActionProblemData,
    ): Promise<ODEResultWithEquations> => {
        const th = await getCachedTheory();
        return th.massAction(model, params);
    },
});
