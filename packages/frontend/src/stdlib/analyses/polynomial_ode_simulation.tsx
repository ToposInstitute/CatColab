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
    type PolynomialODEProblemData,
    type MorType,
    type ObType,
    type QualifiedName,
} from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import { ODEResultPlot } from "../../visualization";
import { createModelODEPlotWithEquations } from "./model_ode_plot";
import type { PolynomialODESimulator } from "./simulator_types";

import "./simulation.css";

/** Analyze a model using mass-action dynamics. */
export default function PolynomialODESimulation(
    props: ModelAnalysisProps<PolynomialODEProblemData> & {
        simulate: PolynomialODESimulator;
        variableType?: ObType;
        title?: string;
        contributionType?: MorType;
    },
) {
    const elaboratedModel = () => props.liveModel.elaboratedModel();

    // Each variable needs to be assigned an initial value, so we need the list of
    // object generators.
    const obGenerators = createMemo<QualifiedName[]>(() => {
        const model = elaboratedModel();
        if (!model) {
            return [];
        }
        return props.variableType ? model.obGeneratorsWithType(props.variableType) : model.obGenerators();
    });

    // Each contribution needs to be assigned a coefficient, so we need the list of
    // morphism generators.
    const morGenerators = createMemo<QualifiedName[]>(() => {
        const model = elaboratedModel();
        if (!model) {
            return [];
        }
        return props.contributionType
            ? model.morGeneratorsWithType(props.contributionType)
            : model.morGenerators();
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
            // validate: (_, data) => data >= 0,
            setData: (id, data) =>
                props.changeContent((content) => {
                    content.initialValues[id] = data;
                }),
        }),
    ];

    // The schema that we use for the <FixedTableEditor> JSX element depends on the
    // value of MassConservationType. We might as well construct all possibilities.

    // Firstly, the case MassConservationType = Balanced
    const morSchema: ColumnSchema<QualifiedName>[] = [
        {
            contentType: "string",
            header: true,
            content: (mor) => elaboratedModel()?.morGeneratorLabel(mor)?.join(".") ?? "",
        },
        createNumericalColumn({
            name: "Coefficient (𝜆)",
            data: (mor) => props.content.coefficients[mor],
            default: 1,
            validate: (_, data) => data >= 0,
            setData: (mor, data) =>
                props.changeContent((content) => {
                    content.coefficients[mor] = data;
                }),
        }),
    ];

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
            />
            <Foldable title="Parameters" defaultExpanded>
                <div class="parameters">
                    <FixedTableEditor rows={obGenerators()} schema={obSchema} />
                    <FixedTableEditor rows={morGenerators()} schema={morSchema} />
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
