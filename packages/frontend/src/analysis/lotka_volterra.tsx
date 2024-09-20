import { Show, createEffect, createMemo, lazy } from "solid-js";

import type { DblModel, LotkaVolterraModelData, ODEModelResult } from "catlog-wasm";
import {
    type ColumnSchema,
    FixedTableEditor,
    Foldable,
    createNumericalColumn,
} from "../components";
import type { MorphismDecl, ObjectDecl } from "../model";
import type { ModelAnalysisMeta } from "../theory";
import type { ODEPlotData } from "../visualization/ode_plot";
import type { LotkaVolterraContent, ModelAnalysisProps } from "./types";

const ODEPlot = lazy(() => import("../visualization/ode_plot"));

import "./simulation.css";

type Simulator = (model: DblModel, data: LotkaVolterraModelData) => ODEModelResult;

/** Configure a Lotka-Volterra ODE analysis for use with models of a theory. */
export function configureLotkaVolterra(options: {
    id?: string;
    name?: string;
    description?: string;
    simulate: Simulator;
}): ModelAnalysisMeta<LotkaVolterraContent> {
    const {
        id = "lotka-volterra",
        name = "Lotka-Volterra dynamics",
        description = "Simulate the system using a Lotka-Volterra ODE",
        simulate,
    } = options;
    return {
        id,
        name,
        description,
        component: (props) => <LotkaVolterra simulate={simulate} title={name} {...props} />,
        initialContent: () => ({
            tag: "lotka-volterra",
            interactionCoefficients: {},
            growthRates: {},
            initialValues: {},
            duration: 10,
        }),
    };
}

/** Analyze a signed graph using Lotka-Volterra dynamics.
 */
export function LotkaVolterra(
    props: {
        simulate: Simulator;
        title?: string;
    } & ModelAnalysisProps<LotkaVolterraContent>,
) {
    const obDecls = createMemo<ObjectDecl[]>(() => {
        return props.liveModel.formalJudgments().filter((jgmt) => jgmt.tag === "object");
    }, []);

    const morDecls = createMemo<MorphismDecl[]>(() => {
        return props.liveModel.formalJudgments().filter((jgmt) => jgmt.tag === "morphism");
    }, []);

    // Set default values of parameters whenever we get new objects/morphisms.
    // Q: Should we "garbage collect" parameters for deleted objects/morphisms?

    createEffect(() => {
        props.changeContent((content) => {
            for (const ob of obDecls()) {
                content.initialValues[ob.id] ??= 0;
                content.growthRates[ob.id] ??= 0;
            }
        });
    });

    createEffect(() => {
        props.changeContent((content) => {
            for (const mor of morDecls()) {
                content.interactionCoefficients[mor.id] ??= 1;
            }
        });
    });

    const obSchema: ColumnSchema<ObjectDecl>[] = [
        {
            header: true,
            content: (ob) => ob.name,
        },
        createNumericalColumn({
            name: "Initial value",
            data: (ob) => props.content.initialValues[ob.id],
            validate: (_, data) => data >= 0,
            setData: (ob, data) =>
                props.changeContent((content) => {
                    content.initialValues[ob.id] = data;
                }),
        }),
        createNumericalColumn({
            name: "Growth/decay",
            data: (ob) => props.content.growthRates[ob.id],
            setData: (ob, data) =>
                props.changeContent((content) => {
                    content.growthRates[ob.id] = data;
                }),
        }),
    ];

    const morSchema: ColumnSchema<MorphismDecl>[] = [
        {
            header: true,
            content: (mor) => mor.name,
        },
        createNumericalColumn({
            name: "Interaction",
            data: (mor) => props.content.interactionCoefficients[mor.id],
            validate: (_, data) => data >= 0,
            setData: (mor, data) =>
                props.changeContent((content) => {
                    content.interactionCoefficients[mor.id] = data;
                }),
        }),
    ];

    const simulationData = createMemo<ODEModelResult | undefined>(
        () => {
            const result = props.liveModel.validationResult();
            if (result?.tag === "validated") {
                return props.simulate(result.validatedModel, props.content);
            }
        },
        undefined,
        { equals: false },
    );

    const plotData = createMemo<ODEPlotData | undefined>(
        () => {
            const data = simulationData();
            if (data) {
                const obIndex = props.liveModel.objectIndex();
                return {
                    time: data.time,
                    states: Array.from(data.states.entries()).map(([id, data]) => ({
                        name: obIndex.map.get(id) ?? "",
                        data,
                    })),
                };
            }
        },
        undefined,
        { equals: false },
    );

    return (
        <div class="simulation">
            <Foldable header={<span class="title">{props.title}</span>}>
                <div class="parameters">
                    <FixedTableEditor rows={obDecls()} schema={obSchema} />
                    <FixedTableEditor rows={morDecls()} schema={morSchema} />
                </div>
            </Foldable>
            <Show when={plotData()}>
                {(d) => (
                    <div class="plot">
                        <ODEPlot data={d()} />
                    </div>
                )}
            </Show>
        </div>
    );
}
