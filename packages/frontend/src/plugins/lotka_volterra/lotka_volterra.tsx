import {
    BlockTitle,
    type ColumnSchema,
    createNumericalColumn,
    FixedTableEditor,
    Foldable,
} from "catcolab-ui-components";
import { type DblModel, type LotkaVolterraProblemData, type QualifiedName } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import { morLabelOrDefault } from "../../model";
import { createModelODEPlot, ODEResultPlot } from "../../visualization";
import type { LotkaVolterraSimulator } from "./types";

import "../../visualization/simulation.css";

/** Analyze a model using Lotka-Volterra dynamics. */
export default function LotkaVolterra(
    props: ModelAnalysisProps<LotkaVolterraProblemData> & {
        simulate: LotkaVolterraSimulator;
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
        createNumericalColumn({
            name: "Growth/decay",
            data: (id) => props.content.growthRates[id],
            setData: (id, data) =>
                props.changeContent((content) => {
                    content.growthRates[id] = data;
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
            name: "Interaction",
            data: (id) => props.content.interactionCoefficients[id],
            default: 1,
            validate: (_, data) => data >= 0,
            setData: (id, data) =>
                props.changeContent((content) => {
                    content.interactionCoefficients[id] = data;
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
            <BlockTitle title="Lotka-Volterra dynamics" />
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
