import { createMemo } from "solid-js";

import type { DblModel, JsResult, LotkaVolterraModelData, ODEResult } from "catlog-wasm";
import type { LotkaVolterraContent, ModelAnalysisProps } from "../../analysis";
import {
    type ColumnSchema,
    FixedTableEditor,
    Foldable,
    createNumericalColumn,
} from "../../components";
import type { MorphismDecl, ObjectDecl } from "../../model";
import type { ModelAnalysisMeta } from "../../theory";
import { type ODEPlotData, ODEResultPlot } from "../../visualization";

import "./simulation.css";

type Simulator = (model: DblModel, data: LotkaVolterraModelData) => ODEResult;

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
            default: 1,
            validate: (_, data) => data >= 0,
            setData: (mor, data) =>
                props.changeContent((content) => {
                    content.interactionCoefficients[mor.id] = data;
                }),
        }),
    ];

    const toplevelSchema: ColumnSchema<null>[] = [
        createNumericalColumn({
            name: "Duration",
            data: (_) => props.content.duration,
            validate: (_, data) => data >= 0,
            setData: (_, data) =>
                props.changeContent((content) => {
                    content.duration = data;
                }),
        }),
    ];

    const simulationResult = createMemo<ODEResult | undefined>(
        () => {
            const result = props.liveModel.validationResult();
            if (result?.tag === "validated") {
                return props.simulate(result.validatedModel, props.content);
            }
        },
        undefined,
        { equals: false },
    );

    const plotResult = createMemo<JsResult<ODEPlotData, string> | undefined>(
        () => {
            const result = simulationResult();
            if (result?.tag === "Ok") {
                const solution = result.content;
                const obIndex = props.liveModel.objectIndex();
                const content = {
                    time: solution.time,
                    states: Array.from(solution.states.entries()).map(([id, data]) => ({
                        name: obIndex.map.get(id) ?? "",
                        data,
                    })),
                };
                return { tag: "Ok", content };
            }
            return result;
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
                    <FixedTableEditor rows={[null]} schema={toplevelSchema} />
                </div>
            </Foldable>
            <ODEResultPlot result={plotResult()} />
        </div>
    );
}
