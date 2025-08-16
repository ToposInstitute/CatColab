import { createMemo } from "solid-js";

import type { DblModel, KuramotoModelData, KuramotoProblemData, ODEResult } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import {
    type ColumnSchema,
    FixedTableEditor,
    Foldable,
    createNumericalColumn,
} from "../../components";
import type { MorphismDecl, ObjectDecl } from "../../model";
import type { ModelAnalysisMeta } from "../../theory";
import { ODEResultPlot } from "../../visualization";
import { createModelODEPlot } from "./simulation";

import "./simulation.css";

/** Configuration for a first-order Kuramoto ODE analysis of a model. */
export type KuramotoContent = KuramotoProblemData<string>;

type Simulator = (model: DblModel, data: KuramotoModelData) => ODEResult;

/** Configure a first-order Kuramoto ODE analysis for use with models of a theory. */
export function configureKuramoto(options: {
    id?: string;
    name?: string;
    description?: string;
    help?: string;
    simulate: Simulator;
}): ModelAnalysisMeta<KuramotoContent> {
    const {
        id = "kuramoto",
        name = "Kuramoto (first-order) dynamics",
        description = "Simulate the system using a first-order Kuramoto model",
        help = "kuramoto",
        simulate,
    } = options;
    return {
        id,
        name,
        description,
        help,
        component: (props) => <Kuramoto simulate={simulate} title={name} {...props} />,
        initialContent: () => ({
            couplingStrengths: {},
            naturalFrequencies: {},
            initialPhases: {},
            duration: 10,
        }),
    };
}

/** Analyze a model using Kuramoto dynamics. */
export function Kuramoto(
    props: ModelAnalysisProps<KuramotoContent> & {
        simulate: Simulator;
        title?: string;
    },
) {
    const obDecls = createMemo<ObjectDecl[]>(() => {
        return props.liveModel.formalJudgments().filter((jgmt) => jgmt.tag === "object");
    }, []);

    const morDecls = createMemo<MorphismDecl[]>(() => {
        return props.liveModel.formalJudgments().filter((jgmt) => jgmt.tag === "morphism");
    }, []);

    const obSchema: ColumnSchema<ObjectDecl>[] = [
        {
            contentType: "string",
            header: true,
            content: (ob) => ob.name,
        },
        createNumericalColumn({
            name: "Initial phase",
            data: (ob) => props.content.initialPhases[ob.id],
            validate: (_, data) => data >= 0,
            setData: (ob, data) =>
                props.changeContent((content) => {
                    content.initialPhases[ob.id] = data;
                }),
        }),
        createNumericalColumn({
            name: "Frequency",
            data: (ob) => props.content.naturalFrequencies[ob.id],
            setData: (ob, data) =>
                props.changeContent((content) => {
                    content.naturalFrequencies[ob.id] = data;
                }),
        }),
    ];

    const morSchema: ColumnSchema<MorphismDecl>[] = [
        {
            contentType: "string",
            header: true,
            content: (mor) => mor.name,
        },
        createNumericalColumn({
            name: "Coupling strength",
            data: (mor) => props.content.couplingStrengths[mor.id],
            default: 1,
            validate: (_, data) => data >= 0,
            setData: (mor, data) =>
                props.changeContent((content) => {
                    content.couplingStrengths[mor.id] = data;
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
                    <FixedTableEditor rows={obDecls()} schema={obSchema} />
                    <FixedTableEditor rows={morDecls()} schema={morSchema} />
                    <FixedTableEditor rows={[null]} schema={toplevelSchema} />
                </div>
            </Foldable>
            <ODEResultPlot result={plotResult()} />
        </div>
    );
}
