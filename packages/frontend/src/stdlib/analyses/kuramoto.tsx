import invariant from "tiny-invariant";

import { type ColumnSchema, FixedTableEditor, createNumericalColumn } from "catcolab-ui-components";
import type { DblModel, JsResult, ODEResult, QualifiedName } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import { Foldable } from "../../components";
import { LiveModelDocument, morLabelOrDefault } from "../../model";
import { ODEPlotData, ODEResultPlot, StateVarData } from "../../visualization";
import type { KuramotoSimulator, KuramotoAnalysisContent } from "./simulator_types";

import "./simulation.css";
import { Accessor, createMemo } from "solid-js";

/** Analyse a model using first- or second-order Kuramoto dynamics. */
export default function Kuramoto(
    props: ModelAnalysisProps<KuramotoAnalysisContent> & {
        simulate: KuramotoSimulator;
        title?: string;
        couplingLabel?: string;
        dampingLabel?: string;
        forcingLabel?: string;
    },
) {
    const elaboratedModel = () => props.liveModel.elaboratedModel();

    const firstOrderObSchema = (): ColumnSchema<QualifiedName>[] => [
        {
            contentType: "string",
            header: true,
            content: (id) => elaboratedModel()?.obGeneratorLabel(id)?.join(".") ?? "",
        },
        createNumericalColumn({
            name: props.dampingLabel ?? "Damping",
            data: (id) => props.content.dampingCoefficients[id],
            validate: (_, data) => data >= 0,
            setData: (id, data) =>
                props.changeContent((content) => {
                    content.dampingCoefficients[id] = data;
                }),
        }),
        createNumericalColumn({
            name: props.forcingLabel ?? "Forcing",
            data: (id) => props.content.forcingParameters[id],
            setData: (id, data) =>
                props.changeContent((content) => {
                    content.forcingParameters[id] = data;
                }),
        }),
        createNumericalColumn({
            name: "Initial phase",
            data: (id) => props.content.initialPhases[id],
            setData: (id, data) =>
                props.changeContent((content) => {
                    content.initialPhases[id] = data;
                }),
        }),
    ];

    const secondOrderObSchema = (): ColumnSchema<QualifiedName>[] => [
        ...firstOrderObSchema(),
        createNumericalColumn({
            name: "Initial frequency",
            data(id) {
                if (props.content.order === "second") {
                    return props.content.initialFrequencies[id];
                }
            },
            setData(id, data) {
                props.changeContent((content) => {
                    invariant(content.order === "second");
                    content.initialFrequencies[id] = data;
                });
            },
        }),
    ];

    const obSchema = (): ColumnSchema<QualifiedName>[] => {
        switch (props.content.order) {
            case "first":
                return firstOrderObSchema();
            case "second":
                return secondOrderObSchema();
            default:
                return [];
        }
    };

    const morSchema = (): ColumnSchema<QualifiedName>[] => [
        {
            contentType: "string",
            header: true,
            content: (id) => morLabelOrDefault(id, elaboratedModel()),
        },
        createNumericalColumn({
            name: props.couplingLabel ?? "Coupling",
            data: (id) => props.content.couplingCoefficients[id],
            default: 1,
            validate: (_, data) => data >= 0,
            setData: (id, data) =>
                props.changeContent((content) => {
                    content.couplingCoefficients[id] = data;
                }),
        }),
    ];

    const toplevelSchema: ColumnSchema<null>[] = [
        {
            name: "Order",
            contentType: "enum",
            variants: (_) => ["first", "second"],
            content: (_) => props.content.order,
            setContent: (_, data) =>
                props.changeContent((content) => {
                    content.order = data === "second" ? data : "first";
                }),
        },
        {
            name: "Plot",
            contentType: "enum",
            variants: (_) => ["phase", "phase difference"],
            content: (_) => props.content.plotVariant,
            setContent: (_, data) =>
                props.changeContent((content) => {
                    content.plotVariant = data === "phase difference" ? "phaseDifference" : "phase";
                }),
        },
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

    function createModelODEPlotKuramoto(
        liveModel: Accessor<LiveModelDocument>,
        simulate: (model: DblModel) => ODEResult,
    ) {
        return createMemo<JsResult<ODEPlotData, string> | undefined>(
            () => {
                const validated = liveModel().validatedModel();
                if (validated?.tag !== "Valid") {
                    return;
                }

                const model = validated.model;
                const simulationResult = simulate(model);
                if (simulationResult?.tag !== "Ok") {
                    return simulationResult;
                }
                const solution = simulationResult.content;

                const states: StateVarData[] = [];
                if (props.content.plotVariant == "phase") {
                    for (const id of model.obGenerators()) {
                        const data = solution.states.get(id);
                        if (data !== undefined) {
                            states.push({
                                name: model.obGeneratorLabel(id)?.join(".") ?? "",
                                data,
                            });
                        }
                    }
                } else if (props.content.plotVariant == "phaseDifference") {
                    for (let i = 0; i < model.obGenerators().length; i++) {
                        for (let j = i+1; j < model.obGenerators().length; j++) {
                            const first_id = model.obGenerators()[i];
                            const second_id = model.obGenerators()[j];
                            if (first_id !== undefined && second_id !== undefined) {
                                const first_label = model.obGeneratorLabel(first_id)?.join(".") ?? "";
                                const first_data = solution.states.get(first_id);
                                const second_label = model.obGeneratorLabel(second_id)?.join(".") ?? "";
                                const second_data = solution.states.get(second_id);
                                if (first_data !== undefined && second_data !== undefined) {
                                    let data : number[] = [];
                                    for (let k = 0; k < first_data.length; k++) {
                                        data[k] = (first_data[k] as number) - (second_data[k] as number);
                                    };
                                    states.push({
                                        name: first_label.concat(" - ").concat(second_label),
                                        data,
                                    })
                                }
                            }
                        }
                    }
                }
                const content = { time: solution.time, states };
                return { tag: "Ok", content };
            },
            undefined,
            { equals: false },
        );
    }

    // Alternative to createModelODEPlot
    const plotResult = createModelODEPlotKuramoto(
        () => props.liveModel,
        (model: DblModel) => props.simulate(model, props.content),
    );

    return (
        <div class="simulation">
            <Foldable title={props.title}>
                <div class="parameters">
                    <FixedTableEditor
                        rows={elaboratedModel()?.obGenerators() ?? []}
                        schema={obSchema()}
                    />
                    <FixedTableEditor
                        rows={elaboratedModel()?.morGenerators() ?? []}
                        schema={morSchema()}
                    />
                    <FixedTableEditor rows={[null]} schema={toplevelSchema} />
                </div>
            </Foldable>
            <ODEResultPlot
                result={plotResult()}
                yAxis={{
                    type: "value",
                    min: -Math.PI,
                    max: Math.PI,
                }}
                yTransform={(value) => Math.atan2(Math.sin(value), Math.cos(value))}
            />
        </div>
    );
}
