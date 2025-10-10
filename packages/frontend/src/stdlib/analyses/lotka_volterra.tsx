import type { DblModel, LotkaVolterraProblemData, ODEResult, QualifiedName } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import {
    type ColumnSchema,
    FixedTableEditor,
    Foldable,
    createNumericalColumn,
} from "../../components";
import { morLabelOrDefault } from "../../model";
import type { ModelAnalysisMeta } from "../../theory";
import { ODEResultPlot } from "../../visualization";
import { createModelODEPlot } from "./simulation";

import "./simulation.css";

type Simulator = (model: DblModel, data: LotkaVolterraProblemData) => ODEResult;

/** Configure a Lotka-Volterra ODE analysis for use with models of a theory. */
export function configureLotkaVolterra(options: {
    id?: string;
    name?: string;
    description?: string;
    help?: string;
    simulate: Simulator;
}): ModelAnalysisMeta<LotkaVolterraProblemData> {
    const {
        id = "lotka-volterra",
        name = "Lotka-Volterra dynamics",
        description = "Simulate the system using a Lotka-Volterra ODE",
        help = "lotka-volterra",
        simulate,
    } = options;
    return {
        id,
        name,
        description,
        help,
        component: (props) => <LotkaVolterra simulate={simulate} title={name} {...props} />,
        initialContent: () => ({
            interactionCoefficients: {},
            growthRates: {},
            initialValues: {},
            duration: 10,
        }),
    };
}

/** Analyze a model using Lotka-Volterra dynamics. */
export function LotkaVolterra(
    props: ModelAnalysisProps<LotkaVolterraProblemData> & {
        simulate: Simulator;
        title?: string;
    },
) {
    const elaboratedModel = () => props.liveModel.elaboratedModel();

    const obSchema: ColumnSchema<QualifiedName>[] = [
        {
            contentType: "string",
            header: true,
            content: (id) => elaboratedModel()?.obGeneratorLabel(id)?.join(".") ?? "",
        },
        createNumericalColumn({
            name: "Initial value",
            data: (id) => props.content.initialValues[id],
            validate: (_, data) => data >= 0,
            setData: (id, data) =>
                props.changeContent((content) => {
                    content.initialValues[id] = data;
                }),
        }),
        createNumericalColumn({
            name: "Growth/decay",
            data: (id) => props.content.growthRates[id],
            setData: (id, data) =>
                props.changeContent((content) => {
                    content.growthRates[id] = data;
                }),
        }),
    ];

    const morSchema: ColumnSchema<QualifiedName>[] = [
        {
            contentType: "string",
            header: true,
            content: (id) => morLabelOrDefault(id, elaboratedModel()),
        },
        createNumericalColumn({
            name: "Interaction",
            data: (id) => props.content.interactionCoefficients[id],
            default: 1,
            validate: (_, data) => data >= 0,
            setData: (id, data) =>
                props.changeContent((content) => {
                    content.interactionCoefficients[id] = data;
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

    const plotResult = createModelODEPlot(
        () => props.liveModel,
        (model: DblModel) => props.simulate(model, props.content),
    );

    return (
        <div class="simulation">
            <Foldable title={props.title}>
                <div class="parameters">
                    <FixedTableEditor
                        rows={elaboratedModel()?.obGenerators() ?? []}
                        schema={obSchema}
                    />
                    <FixedTableEditor
                        rows={elaboratedModel()?.morGenerators() ?? []}
                        schema={morSchema}
                    />
                    <FixedTableEditor rows={[null]} schema={toplevelSchema} />
                </div>
            </Foldable>
            <ODEResultPlot result={plotResult()} />
        </div>
    );
}
