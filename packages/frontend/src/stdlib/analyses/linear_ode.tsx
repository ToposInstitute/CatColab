import { createMemo } from "solid-js";

import type { DblModel, LinearODEModelData, LinearODEProblemData, ODEResult } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import {
    type ColumnSchema,
    FixedTableEditor,
    Foldable,
    createNumericalColumn,
} from "../../components";
import { type MorphismDecl, type ObjectDecl, morNameOrDefault } from "../../model";
import type { ModelAnalysisMeta } from "../../theory";
import { ODEResultPlot } from "../../visualization";
import { createModelODEPlot } from "./simulation";

import "./simulation.css";

/** Configuration for a LinearODE ODE analysis of a model. */
export type LinearODEContent = LinearODEProblemData<string>;

type Simulator = (model: DblModel, data: LinearODEModelData) => ODEResult;

/** Configure a LinearODE ODE analysis for use with models of a theory. */
export function configureLinearODE(options: {
    id?: string;
    name?: string;
    description?: string;
    simulate: Simulator;
}): ModelAnalysisMeta<LinearODEContent> {
    const {
        id = "linear-ode",
        name = "Linear ODE dynamics",
        description = "Simulate the system using a constant-coefficient linear first-order ODE",
        simulate,
    } = options;
    return {
        id,
        name,
        description,
        component: (props) => <LinearODE simulate={simulate} title={name} {...props} />,
        initialContent: () => ({
            coefficients: {},
            initialValues: {},
            duration: 10,
        }),
    };
}

/** Analyze a model using LinearODE dynamics. */
export function LinearODE(
    props: ModelAnalysisProps<LinearODEContent> & {
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
            name: "Initial value",
            data: (ob) => props.content.initialValues[ob.id],
            validate: (_, data) => data >= 0,
            setData: (ob, data) =>
                props.changeContent((content) => {
                    content.initialValues[ob.id] = data;
                }),
        }),
    ];

    const morSchema: ColumnSchema<MorphismDecl>[] = [
        {
            contentType: "string",
            header: true,
            content: (mor) => morNameOrDefault(mor, props.liveModel.objectIndex().map),
        },
        createNumericalColumn({
            name: "Coefficient",
            data: (mor) => props.content.coefficients[mor.id],
            default: 1,
            validate: (_, data) => data >= 0,
            setData: (mor, data) =>
                props.changeContent((content) => {
                    content.coefficients[mor.id] = data;
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
