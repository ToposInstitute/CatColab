import { createMemo } from "solid-js";

import type {
    DblModel,
    CCLModelData,
    CCLProblemData,
    ODEResult,
} from "catlog-wasm";
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

/** Configuration for a CCL ODE analysis of a model. */
export type CCLContent = CCLProblemData<string>;

type Simulator = (model: DblModel, data: CCLModelData) => ODEResult;

/** Configure a CCL ODE analysis for use with models of a theory. */
export function configureCCL(options: {
    id?: string;
    name?: string;
    description?: string;
    simulate: Simulator;
}): ModelAnalysisMeta<CCLContent> {
    const {
        id = "ccl",
        name = "CCL dynamics",
        description = "Simulate the system using a constant-coefficient linear ODE",
        simulate,
    } = options;
    return {
        id,
        name,
        description,
        component: (props) => <CCL simulate={simulate} title={name} {...props} />,
        initialContent: () => ({
            interactionCoefficients: {},
            initialValues: {},
            duration: 10,
        }),
    };
}

/** Analyze a model using CCL dynamics. */
export function CCL(
    props: ModelAnalysisProps<CCLContent> & {
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
