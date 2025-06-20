import { createMemo } from "solid-js";

import type {
    DblModel,
    EnergeseMassActionModelData,
    EnergeseMassActionProblemData,
    ODEResult,
} from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import {
    type ColumnSchema,
    FixedTableEditor,
    Foldable,
    createNumericalColumn,
    // createEnumColumn,
} from "../../components";
import type { MorphismDecl, ObjectDecl } from "../../model";
import type { ModelAnalysisMeta } from "../../theory";
import { ODEResultPlot } from "../../visualization";
import { createModelODEPlot } from "./simulation";
// import { Select } from "@thisbeyond/solid-select";
// import "@thisbeyond/solid-select/style.css";

import "./simulation.css";

/** Configuration for a energese ODE analysis of a model */
export type EnergeseMassActionContent = EnergeseMassActionProblemData<string>;

// EnergeseMassActionModelData is in catlog-wasm, wraps EnergeseMassActionModelData
type Simulator = (
    model: DblModel,
    data: EnergeseMassActionModelData,
) => ODEResult;

/** Configure a mass-action ODE analysis for use with models of a theory. */
export function configureEnergese(options: {
    id?: string;
    name?: string;
    description?: string;
    simulate: Simulator;
    isState?: (ob: ObjectDecl) => boolean;
    isTransition?: (mor: MorphismDecl) => boolean;
}): ModelAnalysisMeta<EnergeseMassActionContent> {
    const {
        id = "energese",
        name = "Energese dynamics",
        description = "Simulate the system using the law of mass action",
        ...otherOptions
    } = options;
    return {
        id,
        name,
        description,
        component: (props) => (
            <EnergeseMassAction title={name} {...otherOptions} {...props} />
        ),
        initialContent: () => ({
            rates: {},
            initialValues: {},
            duration: 10,
            dynamibles: {},
        }),
    };
}

/** Analyze a model using mass-action dynamics. */
export function EnergeseMassAction(
    props: ModelAnalysisProps<EnergeseMassActionContent> & {
        simulate: Simulator;
        isState?: (ob: ObjectDecl) => boolean;
        isTransition?: (mor: MorphismDecl) => boolean;
        title?: string;
    },
) {
    const obDecls = createMemo<ObjectDecl[]>(() => {
        return props.liveModel
            .formalJudgments()
            .filter((jgmt) => jgmt.tag === "object")
            .filter((obj) => obj.obType.content === "Object")
            .filter((ob) => props.isState?.(ob) ?? true);
    }, []);

    const dynamDecls = createMemo<ObjectDecl[]>(() => {
        return props.liveModel
            .formalJudgments()
            .filter((jgmt) => jgmt.tag === "object")
            .filter((obj) => obj.obType.content === "DynamicVariable")
            .filter((ob) => props.isState?.(ob) ?? true);
    }, []);

    const morDecls = createMemo<MorphismDecl[]>(() => {
        return props.liveModel
            .formalJudgments()
            .filter((jgmt) => jgmt.tag === "morphism")
            .filter((mor) => props.isTransition?.(mor) ?? true);
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
            name: "Rate",
            data: (mor) => props.content.rates[mor.id],
            default: 1,
            validate: (_, data) => data >= 0,
            setData: (mor, data) =>
                props.changeContent((content) => {
                    content.rates[mor.id] = data;
                }),
        }),
    ];

    const dynamSchema: ColumnSchema<ObjectDecl>[] = [
        {
            contentType: "string",
            header: true,
            content: (ob) => ob.name,
        },
        {
            contentType: "enum",
            name: "Function",
            variants() {
                return ["Identity", "Heaviside"];
            },
            content: () => "Identity",
            setContent: (ob, value) =>
                props.changeContent((content) => {
                    if (value === null) {
                        delete content.dynamibles[ob.id];
                    } else {
                        content.dynamibles[ob.id] = value;
                    }
                }),
        },
        // TODO createEnumColumn
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

    // XXX
    const plotResult = createModelODEPlot(
        () => props.liveModel,
        (model: DblModel) => props.simulate(model, props.content),
    );

    console.log(props.liveModel.formalJudgments());
    return (
        <div class="simulation">
            <Foldable title={props.title}>
                <div class="parameters">
                    <FixedTableEditor rows={obDecls()} schema={obSchema} />
                    <FixedTableEditor rows={morDecls()} schema={morSchema} />
                    <FixedTableEditor
                        rows={dynamDecls()}
                        schema={dynamSchema}
                    />
                    <FixedTableEditor rows={[null]} schema={toplevelSchema} />
                </div>
            </Foldable>
            <ODEResultPlot result={plotResult()} />
        </div>
    );
}
