import invariant from "tiny-invariant";

import {
    BlockTitle,
    type ColumnSchema,
    createNumericalColumn,
    FixedTableEditor,
} from "catcolab-ui-components";
import type { DblModel, KuramotoProblemData, QualifiedName } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import { morLabelOrDefault } from "../../model";
import { ODEResultPlot } from "../../visualization";
import { createModelODEPlot } from "./model_ode_plot";
import type { KuramotoSimulator } from "./simulator_types";

import "./simulation.css";

/** Analyse a model using first- or second-order Kuramoto dynamics. */
export default function Kuramoto(
    props: ModelAnalysisProps<KuramotoProblemData> & {
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
            content: (id) => morLabelOrDefault(id, elaboratedModel()) ?? "",
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
        () => props.liveModel.validatedModel(),
        (model: DblModel) => props.simulate(model, props.content),
    );

    return (
        <div class="simulation">
            <BlockTitle
                title={props.title}
                settingsPane={
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
                }
            />
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
