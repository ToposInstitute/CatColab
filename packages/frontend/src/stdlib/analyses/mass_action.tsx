import { createMemo } from "solid-js";

import type { DblModel, MassActionProblemData, MorType, ObType, QualifiedName } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import {
    type ColumnSchema,
    FixedTableEditor,
    Foldable,
    createNumericalColumn,
} from "../../components";
import { morLabelOrDefault } from "../../model";
import { ODEResultPlot } from "../../visualization";
import { createModelODEPlot } from "./model_ode_plot";
import type { MassActionSimulator } from "./simulator_types";

import "./simulation.css";

/** Analyze a model using mass-action dynamics. */
export default function MassAction(
    props: ModelAnalysisProps<MassActionProblemData> & {
        simulate: MassActionSimulator;
        isState?: (obType: ObType) => boolean;
        isTransition?: (morType: MorType) => boolean;
        title?: string;
    },
) {
    const elaboratedModel = () => props.liveModel.elaboratedModel();

    const obGenerators = createMemo<QualifiedName[]>(() => {
        const [model, pred] = [elaboratedModel(), props.isState];
        if (!model) {
            return [];
        }
        return model
            .obGenerators()
            .filter((id) => !pred || pred(model.obType({ tag: "Basic", content: id })));
    }, []);

    const morGenerators = createMemo<QualifiedName[]>(() => {
        const [model, pred] = [elaboratedModel(), props.isTransition];
        if (!model) {
            return [];
        }
        return model
            .morGenerators()
            .filter((id) => !pred || pred(model.morType({ tag: "Basic", content: id })));
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

    const morSchema: ColumnSchema<QualifiedName>[] = [
        {
            contentType: "string",
            header: true,
            content: (id) => morLabelOrDefault(id, elaboratedModel()),
        },
        createNumericalColumn({
            name: "Rate",
            data: (id) => props.content.rates[id],
            default: 1,
            validate: (_, data) => data >= 0,
            setData: (id, data) =>
                props.changeContent((content) => {
                    content.rates[id] = data;
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
                    <FixedTableEditor rows={obGenerators()} schema={obSchema} />
                    <FixedTableEditor rows={morGenerators()} schema={morSchema} />
                    <FixedTableEditor rows={[null]} schema={toplevelSchema} />
                </div>
            </Foldable>
            <ODEResultPlot result={plotResult()} />
        </div>
    );
}
