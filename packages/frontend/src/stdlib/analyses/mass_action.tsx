import { createMemo } from "solid-js";

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
    type MorType,
    type ObType,
    type QualifiedName,
    type MassActionProblemData,
} from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import { morLabelOrDefault } from "../../model";
import { ODEResultPlot } from "../../visualization";
import { createModelODEPlotWithEquations } from "./model_ode_plot";
import type { MassActionSimulator } from "./simulator_types";
import { MassActionConfigForm } from "./mass_action_config_form";

import "./simulation.css";

import invariant from "tiny-invariant";

import styles from "./mass_action.module.css";

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

    const obGenerators = createMemo<QualifiedName[]>(() => {
        const model = elaboratedModel();
        if (!model) {
            return [];
        }
        return props.stateType ? model.obGeneratorsWithType(props.stateType) : model.obGenerators();
    }, []);

    // Every transition in a Petri net (or flow in a stock-flow) has an interface:
    // a list of input places, and a list of output places.
    type TransitionInterface = Record<
        QualifiedName,
        { inputs: QualifiedName[]; outputs: QualifiedName[] }
    >;

    const morGeneratorsInterfaces = createMemo<TransitionInterface>(() => {
        const model = elaboratedModel();
        if (!model) {
            return {};
        }
        const morGenerators = props.transitionType
            ? model.morGeneratorsWithType(props.transitionType)
            : model.morGenerators();
        const transitionInterface: TransitionInterface = {};

        for (const mg of morGenerators) {
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

    // When we create the parameter table, we need a row for each input to each transition,
    // i.e. we need a list of pairs (transition, input_place).
    const morGeneratorsInputs = createMemo<[QualifiedName, QualifiedName][]>(() => {
        const morphismInputPairs: [QualifiedName, QualifiedName][] = [];
        for (const [mor, int] of Object.entries(morGeneratorsInterfaces())) {
            for (const inp of int.inputs) {
                morphismInputPairs.push([mor, inp]);
            }
        }
        return morphismInputPairs;
    });

    // As for morGeneratorInputs, but now for pairs (transition, output_place).
    const morGeneratorsOutputs = createMemo<[QualifiedName, QualifiedName][]>(() => {
        const morphismOutputPairs: [QualifiedName, QualifiedName][] = [];
        for (const [mor, int] of Object.entries(morGeneratorsInterfaces())) {
            for (const outp of int.outputs) {
                morphismOutputPairs.push([mor, outp]);
            }
        }
        return morphismOutputPairs;
    });

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

    // For now, we simply label the row corresponding to the pair (transition, input_place)
    // as "input_place -> [transition]".
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
            data: ([mor, input]) => (props.content.consumptionRates[mor]?.[input]),
            default: 1,
            validate: (_, data) => data >= 0,
            setData: ([mor, input], data) =>
                props.changeContent((content) => {
                    if (content.consumptionRates[mor]) {
                        content.consumptionRates[mor][input] = data;
                    } else {
                        content.consumptionRates[mor] = { [input]: data };
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
            data: ([mor, output]) => props.content.productionRates[mor]?.[output],
            default: 1,
            validate: (_, data) => data >= 0,
            setData: ([mor, output], data) =>
                props.changeContent((content) => {
                    if (content.productionRates[mor]) {
                        content.productionRates[mor][output] = data;
                    } else {
                        content.productionRates[mor] = { [output]: data };
                    }
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
                settingsPane={
                    <MassActionConfigForm
                        config={props.content}
                        changeConfig={props.changeContent}
                    />
                }
            />
            <Foldable title="Parameters" defaultExpanded>
                <div class="parameters">
                    <FixedTableEditor rows={obGenerators()} schema={obSchema} />
                    <FixedTableEditor rows={morGeneratorsInputs()} schema={morInputsSchema} />
                    <FixedTableEditor rows={morGeneratorsOutputs()} schema={morOutputsSchema} />
                </div>
            </Foldable>
            <Foldable title="Equations" class={styles.equations}>
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
