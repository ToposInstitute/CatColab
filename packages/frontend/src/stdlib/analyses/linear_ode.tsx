import {
    BlockTitle,
    type ColumnSchema,
    createNumericalColumn,
    FixedTableEditor,
    Foldable,
    ExpandableTable,
    KatexDisplay,
} from "catcolab-ui-components";
import type { LinearODEProblemData, QualifiedName } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import { morLabelOrDefault } from "../../model";
import { ODEResultPlot } from "../../visualization";
import { createModelODEPlotWithEquations } from "./model_ode_plot";
import type { LinearODESimulator } from "./simulator_types";

import "./simulation.css";

/** Analyze a model using LinearODE dynamics. */
export default function LinearODE(
    props: ModelAnalysisProps<LinearODEProblemData> & {
        simulate: LinearODESimulator;
        title?: string;
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
            <Foldable title="Simulation" defaultExpanded>
                <ODEResultPlot result={plotResult()} />
            </Foldable>
        </div>
    );
}
