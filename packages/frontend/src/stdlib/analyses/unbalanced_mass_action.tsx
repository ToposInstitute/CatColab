import { createMemo, For } from "solid-js";

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
    type UnbalancedMassActionProblemData,
} from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import { morLabelOrDefault } from "../../model";
import { ODEResultPlot } from "../../visualization";
import { createModelODEPlotWithEquations } from "./model_ode_plot";
import type { UnbalancedMassActionSimulator } from "./simulator_types";

import "./simulation.css";

import invariant from "tiny-invariant";

import styles from "./mass_action.module.css";

/** Analyze a model using unbalanced mass-action dynamics. */
export default function UnbalancedMassAction(
    props: ModelAnalysisProps<UnbalancedMassActionProblemData> & {
        simulate: UnbalancedMassActionSimulator;
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
        var transitionInterface: TransitionInterface = {};

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

    const morGeneratorsCodsTEMP = createMemo<QualifiedName[]>(() => {
        const model = elaboratedModel();
        if (!model) {
            return [];
        }
        return props.transitionType
            ? model.morGeneratorsWithType(props.transitionType)
            : model.morGenerators();
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

    const morInputsSchema: ColumnSchema<QualifiedName>[] = [
        {
            contentType: "string",
            header: true,
            name: "Test",
            content: (id) => morLabelOrDefault(id, elaboratedModel()) ?? "",
        },
        createNumericalColumn({
            name: "Consumption",
            data: (id) => props.content.consumptionRates[id],
            default: 1,
            validate: (_, data) => data >= 0,
            setData: (id, data) =>
                props.changeContent((content) => {
                    content.consumptionRates[id] = data;
                }),
        }),
    ]

    const morCodsSchemaTEMP: ColumnSchema<QualifiedName>[] = [
        {
            contentType: "string",
            header: true,
            content: (id) => morLabelOrDefault(id, elaboratedModel()) ?? "",
        },
        createNumericalColumn({
            name: "Production",
            data: (id) => props.content.productionRates[id],
            default: 1,
            validate: (_, data) => data >= 0,
            setData: (id, data) =>
                props.changeContent((content) => {
                    content.productionRates[id] = data;
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
            <BlockTitle title={props.title} />
            <Foldable title="Parameters" defaultExpanded>
                <div class="parameters">
                    <FixedTableEditor rows={obGenerators()} schema={obSchema} />
                    <For each={Object.keys(morGeneratorsInterfaces())}>
                        {(mor) => {
                            const inputs = morGeneratorsInterfaces()?.[mor]?.inputs
                            if (inputs != undefined) {
                                return <FixedTableEditor rows={inputs} schema={morInputsSchema} />
                            }
                        }}
                    </For>
                    <FixedTableEditor rows={morGeneratorsCodsTEMP()} schema={morCodsSchemaTEMP} />
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
