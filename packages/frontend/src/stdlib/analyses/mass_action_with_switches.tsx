import { createMemo } from "solid-js";

import type { DblModel, SwitchingMassActionModelData, SwitchingMassActionProblemData, ODEResult } from "catlog-wasm";
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

/** Configuration for a mass-action ODE analysis of a model. */
export type SwitchingMassActionContent = SwitchingMassActionProblemData<string>;

type Simulator = (model: DblModel, data: SwitchingMassActionModelData) => ODEResult;

/** Configure a mass-action ODE analysis for use with models of a theory. */
export function configureSwitchingMassAction(options: {
    id?: string;
    name?: string;
    description?: string;
    simulate: Simulator;
    isState?: (ob: ObjectDecl) => boolean;
    isTransition?: (mor: MorphismDecl) => boolean;
}): ModelAnalysisMeta<SwitchingMassActionContent> {
    const {
        id = "switching-mass-action",
        name = "Mass-action dynamics",
        description = "Simulate the system using the law of mass action",
        ...otherOptions
    } = options;
    return {
        id,
        name,
        description,
        component: (props) => <SwitchingMassAction title={name} {...otherOptions} {...props} />,
        initialContent: () => ({
            rates: {},
            initialValues: {},
            duration: 10,
			switches: {},
        }),
    };
}

/** Analyze a model using mass-action dynamics. */
export function SwitchingMassAction(
    props: ModelAnalysisProps<SwitchingMassActionContent> & {
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


	const switchingDecls = createMemo<MorphismDecl[]>(() => {
        return props.liveModel
            .formalJudgments()
            .filter((jgmt) => jgmt.tag === "morphism")
			.filter((mor) => mor.morType.content === "Switch");
    }, []);
	console.log(switchingDecls());

    const morDecls = createMemo<MorphismDecl[]>(() => {
        return props.liveModel
            .formalJudgments()
            .filter((jgmt) => jgmt.tag === "morphism")
			.filter((mor) => mor.morType.content === "Object")
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

	const switchingSchema: ColumnSchema<ObjectDecl>[] = [
        {
            contentType: "string",
            header: true,
            content: (ob) => ob.name,
        },
        {
            contentType: "enum",
            name: "Function",
            variants() {
                return ["Nothing", ">", "<"];
            },
            content: () => "Nothing",
            setContent: (ob, value) =>
                props.changeContent((content) => {
                    if (value === null) {
                        delete content.switches[ob.id];
                    } else {
                        content.switches[ob.id] = value;
                    }
                }),
        },
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
					<FixedTableEditor rows={switchingDecls()} schema={switchingSchema} />
                    <FixedTableEditor rows={[null]} schema={toplevelSchema} />
                </div>
            </Foldable>
            <ODEResultPlot result={plotResult()} />
        </div>
    );
}
