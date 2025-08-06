import { createMemo } from "solid-js";

import type {
    DblModel,
    ODEResult,
    SwitchingMassActionModelData,
    SwitchingMassActionProblemData,
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

/** Configuration for a mass-action ODE analysis of a model. */
export type SwitchingMassActionContent = SwitchingMassActionProblemData<string>;

type Simulator = (model: DblModel, data: SwitchingMassActionModelData) => ODEResult;

/** Configure a mass-action ODE analysis for use with models of a theory. */
export function configureSwitchingMassAction(options: {
    id?: string;
    name?: string;
    description?: string;
    help?: string;
    simulate: Simulator;
    isState?: (ob: ObjectDecl) => boolean;
    isTransition?: (mor: MorphismDecl) => boolean;
}): ModelAnalysisMeta<SwitchingMassActionContent> {
    const {
        id = "switching-mass-action",
        name = "Switching Mass-action dynamics",
        description = "Simulate a switching system using the law of mass action",
        help = "mass-action",
        ...otherOptions
    } = options;
    return {
        id,
        name,
        description,
        help,
        component: (props) => <SwitchingMassAction title={name} {...otherOptions} {...props} />,
        initialContent: () => ({
            mass: { rates: {}, initialValues: {}, duration: 10 },
            functions: {},
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
	console.log(props.liveModel.formalJudgments());
    const obDecls = createMemo<ObjectDecl[]>(() => {
        return props.liveModel
            .formalJudgments()
            .filter((jgmt) => jgmt.tag === "object")
			.filter((ob) => ob.obType.content === "State")
            .filter((ob) => props.isState?.(ob) ?? true);
    }, []);

	const auxDecls = createMemo<ObjectDecl[]>(() => {
        return props.liveModel
            .formalJudgments()
            .filter((jgmt) => jgmt.tag === "object")
			.filter((ob) => ob.obType.content === "Auxiliary");
    }, []);

    // const morDecls = createMemo<MorphismDecl[]>(() => {
    //     return props.liveModel
    //         .formalJudgments()
    //         .filter((jgmt) => jgmt.tag === "morphism")
			// // .filter((mor) => mor.morType.content === "out-pos")
    //         .filter((mor) => props.isTransition?.(mor) ?? true);
    // }, []);

	const functionDecls = createMemo<MorphismDecl[]>(() => {
		return props.liveModel.formalJudgments().filter((jgmt) => jgmt.tag === "morphism").filter((mor) => mor.morType.content === "function").filter((mor) => props.isTransition?.(mor) ?? true);
	}, []);

    const obSchema: ColumnSchema<ObjectDecl>[] = [
        {
            contentType: "string",
            header: true,
            content: (ob) => ob.name,
        },
        createNumericalColumn({
            name: "Initial value",
            data: (ob) => props.content.mass.initialValues[ob.id],
            validate: (_, data) => data >= 0,
            setData: (ob, data) =>
                props.changeContent((content) => {
                    content.mass.initialValues[ob.id] = data;
                }),
        }),
    ];

    const auxSchema: ColumnSchema<ObjectDecl>[] = [
        {
            contentType: "string",
            header: true,
            content: (mor) => mor.name,
        },
        createNumericalColumn({
            name: "Rate",
            data: (mor) => props.content.mass.rates[mor.id],
            default: 1,
            validate: (_, data) => data >= 0,
            setData: (mor, data) =>
                props.changeContent((content) => {
					console.log(content.mass.rates);
                    content.mass.rates[mor.id] = data;
                }),
        }),
    ];

    // TODO Duration is a simulation-level quantity and should be moved outside of "mass"
    const toplevelSchema: ColumnSchema<null>[] = [
        createNumericalColumn({
            name: "Duration",
            data: (_) => props.content.mass.duration,
            validate: (_, data) => data >= 0,
            setData: (_, data) =>
                props.changeContent((content) => {
                    content.mass.duration = data;
                }),
        }),
    ];



	const functionSchema: ColumnSchema<MorphismDecl>[] = [
        {
            contentType: "string",
            header: true,
            content: (ob) => ob.name,
        },
        {
            contentType: "enum",
            name: "Function",
            variants() {
                return ["Identity", "Geq"];
            },
            content: () => "Geq",
            setContent: (ob, value) =>
                props.changeContent((content) => {
                    if (value === null) {
                        delete content.functions[ob.id];
                    } else {
                        content.functions[ob.id] = value;
                    }
                }),
        },
        // TODO createEnumColumn
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
                    <FixedTableEditor rows={auxDecls()} schema={auxSchema} />
					<FixedTableEditor rows={functionDecls()} schema={functionSchema} />
                    <FixedTableEditor rows={[null]} schema={toplevelSchema} />
                </div>
            </Foldable>
            <ODEResultPlot result={plotResult()} />
        </div>
    );
}
