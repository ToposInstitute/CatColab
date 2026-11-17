import {
    BlockTitle,
    type ColumnSchema,
    createNumericalColumn,
    FixedTableEditor,
    Foldable,
} from "catcolab-ui-components";
import { type DblModel, type LinearODEProblemData, type QualifiedName } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import { morLabelOrDefault } from "../../model";
import { createModelODEPlot, ODEResultPlot } from "../../visualization";
import type { LinearODESimulator } from "./types";

import "../../visualization/simulation.css";

/** Analyze a model using LinearODE dynamics. */
export default function LinearODE(
    props: ModelAnalysisProps<LinearODEProblemData> & {
        simulate: LinearODESimulator;
    },
) {
    const elaboratedModel = () => props.liveModel.elaboratedModel();

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
            content: (id) => morLabelOrDefault(id, elaboratedModel()) ?? "",
        },
        createNumericalColumn({
            name: "Coefficient",
            data: (id) => props.content.coefficients[id],
            default: 1,
            validate: (_, data) => data >= 0,
            setData: (id, data) =>
                props.changeContent((content) => {
                    content.coefficients[id] = data;
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
        () => props.liveModel.validatedModel(),
        (model: DblModel) => props.simulate(model, props.content),
    );

    return (
        <div class="simulation">
            <BlockTitle title="Linear ODE dynamics" />
            <Foldable title="Parameters" defaultExpanded>
                <div class="parameters">
                    <FixedTableEditor
                        rows={elaboratedModel()?.obGenerators() ?? []}
                        schema={obSchema}
                    />
                    <FixedTableEditor
                        rows={elaboratedModel()?.morGenerators() ?? []}
                        schema={morSchema}
                    />
                    <FixedTableEditor rows={[null]} schema={toplevelSchema} />
                </div>
            </Foldable>
            <ODEResultPlot result={plotResult()} />
        </div>
    );
}
