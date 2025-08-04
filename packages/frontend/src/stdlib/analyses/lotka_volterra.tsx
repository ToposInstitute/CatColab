import { createMemo } from "solid-js";

import type {
    DblModelNext,
    LotkaVolterraModelData,
    LotkaVolterraProblemData,
    MorGenerator,
    ObGenerator,
    ODEResultNext,
    QualifiedName,
} from "catlaborator";
import type { ModelAnalysisProps } from "../../analysis";
import {
    type ColumnSchema,
    createNumericalColumn,
    FixedTableEditor,
    Foldable,
} from "../../components";
import type { ModelAnalysisMeta } from "../../theory";
import { ODEResultPlot } from "../../visualization";
import { createModelODEPlotNext } from "./simulation";

import "./simulation.css";

/** Configuration for a Lotka-Volterra ODE analysis of a model. */
export type LotkaVolterraContent = LotkaVolterraProblemData;

type Simulator = (model: DblModelNext, data: LotkaVolterraModelData) => ODEResultNext;

/** Configure a Lotka-Volterra ODE analysis for use with models of a theory. */
export function configureLotkaVolterra(options: {
    id?: string;
    name?: string;
    description?: string;
    help?: string;
    simulate: Simulator;
}): ModelAnalysisMeta<LotkaVolterraContent> {
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

export function stableName(name: QualifiedName): string {
    return name.segments.map((segment) => segment.id || `${segment.name}`).join(" ");
}

export function displayName(name: QualifiedName): string {
    return name.segments.map((segment) => segment.name || `<unnamed>`).join(".");
}

/** Analyze a model using Lotka-Volterra dynamics. */
export function LotkaVolterra(
    props: ModelAnalysisProps<LotkaVolterraContent> & {
        simulate: Simulator;
        title?: string;
    },
) {
    const obGenerators = createMemo<ObGenerator[]>(() => {
        const obGens = props.liveModel.validatedModelNext()?.ob_generators() || [];
        console.log(obGens);
        return obGens;
    }, []);

    const morGenerators = createMemo<MorGenerator[]>(() => {
        return props.liveModel.validatedModelNext()?.mor_generators() || [];
    }, []);

    const obSchema: ColumnSchema<ObGenerator>[] = [
        {
            contentType: "string",
            header: true,
            content: (ob) => displayName(ob.name),
        },
        createNumericalColumn({
            name: "Initial value",
            data: (ob) => props.content.initialValues[stableName(ob.name)],
            validate: (_, data) => data >= 0,
            setData: (ob, data) =>
                props.changeContent((content) => {
                    content.initialValues[stableName(ob.name)] = data;
                }),
        }),
        createNumericalColumn({
            name: "Growth/decay",
            data: (ob) => props.content.growthRates[stableName(ob.name)],
            setData: (ob, data) =>
                props.changeContent((content) => {
                    content.growthRates[stableName(ob.name)] = data;
                }),
        }),
    ];

    const morSchema: ColumnSchema<MorGenerator>[] = [
        {
            contentType: "string",
            header: true,
            content: (mor) => displayName(mor.name),
        },
        createNumericalColumn({
            name: "Interaction",
            data: (mor) => props.content.interactionCoefficients[stableName(mor.name)],
            default: 1,
            validate: (_, data) => data >= 0,
            setData: (mor, data) =>
                props.changeContent((content) => {
                    content.interactionCoefficients[stableName(mor.name)] = data;
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

    const plotResult = createModelODEPlotNext(
        () => props.liveModel,
        (model: DblModelNext) => props.simulate(model, props.content),
    );

    return (
        <div class="simulation">
            <Foldable title={props.title}>
                <div class="parameters">
                    <FixedTableEditor rows={obGenerators()} schema={obSchema} />
                    <FixedTableEditor rows={morGenerators()} schema={morSchema} />
                    <FixedTableEditor rows={[null]} schema={toplevelSchema} />
                </div>
            </Foldable>
            <ODEResultPlot result={plotResult()} />
        </div>
    );
}
