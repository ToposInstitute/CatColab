import { createMemo, For, JSX } from "solid-js";

import {
    BlockTitle,
    type ColumnSchema,
    createNumericalColumn,
    ExpandableTable,
    FixedTableEditor,
    Foldable,
    KatexDisplay,
} from "catcolab-ui-components";
import {
    collectProduct,
    type MassActionProblemData,
    type MorType,
    type ObType,
    type QualifiedName,
} from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import { morLabelOrDefault } from "../../model";
import { ODEResultPlot } from "../../visualization";
import { createModelODEPlotWithEquations } from "./model_ode_plot";
import type { MassActionSimulator } from "./simulator_types";
// import { MassActionConfigForm } from "./mass_action_config_form";

import "./simulation.css";

import invariant from "tiny-invariant";

/** Analyze a model using mass-action dynamics. */
export default function MassAction(
    props: ModelAnalysisProps<MassActionProblemData> & {
        simulate: MassActionSimulator;
        stateType?: ObType;
        transitionType?: MorType;
        title?: string;
    },
) {
    const elaboratedModel = () => props.liveModel.elaboratedModel();

    // Irrelevant of the value of massConservationType, we only ever need a single
    // schema for objects: each object needs to be assigned an initial value.

    const obGenerators = createMemo<QualifiedName[]>(() => {
        const model = elaboratedModel();
        if (!model) {
            return [];
        }
        return props.stateType ? model.obGeneratorsWithType(props.stateType) : model.obGenerators();
    }, []);

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
    ];

    // For morphisms, the data that we need now does depend on massConservationType.
    // We don't simply want to get a list of morphism generators, but instead
    // account for the entire *interface* of each morphism. In a Petri net, this
    // consists of a list of input places and a list of output places for each
    // transition; in a stock-flow diagram, this consists of a singleton list
    // of input stocks and a singleton list of output stocks for each flow.
    type TransitionInterface = Record<
        QualifiedName,
        { inputs: QualifiedName[]; outputs: QualifiedName[] }
    >;

    // We start by constructing all the data that we might need, i.e. all the
    // transition interfaces.
    const morGenerators = createMemo<QualifiedName[]>(() => {
        const model = elaboratedModel();
        if (!model) {
            return [];
        }
        return props.transitionType
            ? model.morGeneratorsWithType(props.transitionType)
            : model.morGenerators();
    });

    const morGeneratorsInterfaces = createMemo<TransitionInterface>(() => {
        const model = elaboratedModel();
        if (!model) {
            return {};
        }
        const transitionInterface: TransitionInterface = {};

        for (const mg of morGenerators()) {
            const mor = model.morPresentation(mg);
            if (!mor) {
                continue;
            }
            transitionInterface[mg] = {
                inputs: [],
                outputs: [],
            };
            for (const [_, ob] of collectProduct(mor.dom).entries()) {
                invariant(ob.tag === "Basic");
                // TODO: should we have [i, ob] and be worrying about ${i}?
                transitionInterface[mg].inputs.push(ob.content);
            }
            for (const [_, ob] of collectProduct(mor.cod).entries()) {
                invariant(ob.tag === "Basic");
                transitionInterface[mg].outputs.push(ob.content);
            }
        }

        return transitionInterface;
    });

    // We also need a helper function to turn our TransitionInterface objects into
    // lists of pairs: [(transition, input_place)] and [(transition, output_place)].
    // Again, in the case of stock-flow diagrams (or just certain Petri nets), this
    // might be a singleton list.
    const morGeneratorsInputs = createMemo<[QualifiedName, QualifiedName][]>(() => {
        const morphismInputPairs: [QualifiedName, QualifiedName][] = [];
        for (const [mor, int] of Object.entries(morGeneratorsInterfaces())) {
            for (const inp of int.inputs) {
                morphismInputPairs.push([mor, inp]);
            }
        }
        return morphismInputPairs;
    });
    const morGeneratorsOutputs = createMemo<[QualifiedName, QualifiedName][]>(() => {
        const morphismOutputPairs: [QualifiedName, QualifiedName][] = [];
        for (const [mor, int] of Object.entries(morGeneratorsInterfaces())) {
            for (const outp of int.outputs) {
                morphismOutputPairs.push([mor, outp]);
            }
        }
        return morphismOutputPairs;
    });

    // The schema that we use for the <FixedTableEditor> JSX element depends on the
    // value of MassConservationType. We might as well construct all possibilities.

    // Firstly, the case MassConservationType = Balanced
    const morSchema: ColumnSchema<QualifiedName>[] = [
        {
            contentType: "string",
            header: true,
            content: (mor) => elaboratedModel()?.obGeneratorLabel(mor)?.join(".") ?? "",
        },
        createNumericalColumn({
            name: "Rate (𝑟)",
            data: (mor) => props.content.transitionRates[mor],
            default: 1,
            validate: (_, data) => data >= 0,
            setData: (mor, data) =>
                props.changeContent((content) => {
                    content.transitionRates[mor] = data;
                }),
        }),
    ];

    // Secondly, the case MassConservationType = Unbalanced(PerTransition)
    const morInputSchema: ColumnSchema<QualifiedName>[] = [
        {
            contentType: "string",
            header: true,
            content: (mor) => elaboratedModel()?.obGeneratorLabel(mor)?.join(".") ?? "",
        },
        createNumericalColumn({
            name: "Consumption (𝜅)",
            data: (mor) => props.content.transitionConsumptionRates[mor],
            default: 1,
            validate: (_, data) => data >= 0,
            setData: (mor, data) =>
                props.changeContent((content) => {
                    content.transitionConsumptionRates[mor] = data;
                }),
        }),
    ];
    const morOutputSchema: ColumnSchema<QualifiedName>[] = [
        {
            contentType: "string",
            header: true,
            content: (mor) => elaboratedModel()?.obGeneratorLabel(mor)?.join(".") ?? "",
        },
        createNumericalColumn({
            name: "Production (𝜌)",
            data: (mor) => props.content.transitionProductionRates[mor],
            default: 1,
            validate: (_, data) => data >= 0,
            setData: (mor, data) =>
                props.changeContent((content) => {
                    content.transitionProductionRates[mor] = data;
                }),
        }),
    ];

    // Finally, the case MassConservationType = Unbalanced(PerPlace)
    const morInputsSchema: ColumnSchema<[QualifiedName, QualifiedName]>[] = [
        {
            contentType: "string",
            header: true,
            content: ([mor, input]) =>
                (elaboratedModel()?.obGeneratorLabel(input)?.join(".") ?? "") +
                " -> " +
                "[" +
                (morLabelOrDefault(mor, elaboratedModel()) ?? "") +
                "]",
        },
        createNumericalColumn({
            name: "Consumption (𝜅)",
            data: ([mor, input]) => props.content.placeConsumptionRates[mor]?.[input],
            default: 1,
            validate: (_, data) => data >= 0,
            setData: ([mor, input], data) =>
                props.changeContent((content) => {
                    if (content.placeConsumptionRates[mor]) {
                        content.placeConsumptionRates[mor][input] = data;
                    } else {
                        content.placeConsumptionRates[mor] = { [input]: data };
                    }
                }),
        }),
    ];
    const morOutputsSchema: ColumnSchema<[QualifiedName, QualifiedName]>[] = [
        {
            contentType: "string",
            header: true,
            content: ([mor, output]) =>
                "[" +
                (morLabelOrDefault(mor, elaboratedModel()) ?? "") +
                "]" +
                " -> " +
                (elaboratedModel()?.obGeneratorLabel(output)?.join(".") ?? ""),
        },
        createNumericalColumn({
            name: "Production (𝜌)",
            data: ([mor, output]) => props.content.placeProductionRates[mor]?.[output],
            default: 1,
            validate: (_, data) => data >= 0,
            setData: ([mor, output], data) =>
                props.changeContent((content) => {
                    if (content.placeProductionRates[mor]) {
                        content.placeProductionRates[mor][output] = data;
                    } else {
                        content.placeProductionRates[mor] = { [output]: data };
                    }
                }),
        }),
    ];

    // Now we can generate the parameter tables that will actually be rendered.
    const parameterTables = createMemo<JSX.Element[]>(() => {
        switch (props.content.massConservationType.type) {
        case "Balanced":
            return [
                (<FixedTableEditor rows={morGenerators()} schema={morSchema} />)
            ];
            break;
        case "Unbalanced":
            switch (props.content.massConservationType.granularity.type) {
            case "PerTransition":
                return [
                    (<FixedTableEditor rows={morGenerators()} schema={morInputSchema} />),
                    (<FixedTableEditor rows={morGenerators()} schema={morOutputSchema} />)
                ];
                break;
            case "PerPlace":
                return [
                    (<FixedTableEditor rows={morGeneratorsInputs()} schema={morInputsSchema} />),
                    (<FixedTableEditor rows={morGeneratorsOutputs()} schema={morOutputsSchema} />)
                ];
                break;
            }
            break;
        }
    });

    // Finally, we need the duration, and then we can return everything.
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

    const result = createModelODEPlotWithEquations(
        () => props.liveModel.validatedModel(),
        (model) => props.simulate(model, props.content),
    );

    const plotResult = () => result()?.plotData;
    const latexEquations = () => result()?.latexEquations ?? [];

    return (
        <div class="simulation">
            <BlockTitle
                title={props.title}
                // TODO: follow the below plan maybe?
                //
                // 1. match on MassConservationType to generate the "Parameters" <Foldable>
                // 2. match on liveModel.theory()?.id to determine which values of MassConservationType
                //    can actually be chosen in the settings panel
                // 
                // 
                // settingsPane={
                //     <MassActionConfigForm
                //         config={props.content}
                //         changeConfig={props.changeContent}
                //     />
                // }
            />
            <Foldable title="Parameters" defaultExpanded>
                <div class="parameters">
                    <FixedTableEditor rows={obGenerators()} schema={obSchema} />
                    <For each={parameterTables()}>
                        {(item) => item}
                    </For>
                </div>
            </Foldable>
            <Foldable title="Equations">
                <ExpandableTable
                    threshold={20}
                    rows={latexEquations()}
                    columns={[
                        { cell: (row) => <KatexDisplay math={row.lhs} /> },
                        { cell: () => <KatexDisplay math="=" /> },
                        { cell: (row) => <KatexDisplay math={row.rhs} /> },
                    ]}
                />
            </Foldable>
            <Foldable title="Simulation">
                <div class="parameters">
                    <FixedTableEditor rows={[null]} schema={toplevelSchema} />
                </div>
                <ODEResultPlot result={plotResult()} />
            </Foldable>
        </div>
    );
}
