import { createMemo, createSignal, Show } from "solid-js";
import RefreshIcon from 'lucide-solid/icons/rotate-cw';

import type {
    DblModel,
    MassActionProblemData,
    MorType,
    ODEResult,
    ObType,
    QualifiedName,
} from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import {
    type ColumnSchema,
    FixedTableEditor,
    Foldable,
    IconButton,
    createNumericalColumn,
} from "../../components";
import { morLabelOrDefault } from "../../model";
import type { ModelAnalysisMeta } from "../../theory";
import { ODEResultPlot } from "../../visualization";
import { createModelODEPlot } from "./simulation";

import "./simulation.css";

type Simulator = (model: DblModel, data: MassActionProblemData) => ODEResult;

/** Configure a mass-action ODE analysis for use with models of a theory. */
export function configureMassAction(options: {
    id?: string;
    name?: string;
    description?: string;
    help?: string;
    simulate: Simulator;
    isState?: (obType: ObType) => boolean;
    isTransition?: (morType: MorType) => boolean;
    isStochastic?: boolean;
}): ModelAnalysisMeta<MassActionProblemData> {
    const {
        id = "mass-action",
        name = "Mass-action dynamics",
        description = "Simulate the system using the law of mass action",
        help = "mass-action",
        ...otherOptions
    } = options;
    return {
        id,
        name,
        description,
        help,
        component: (props) => <MassAction title={name} {...otherOptions} {...props} />,
        initialContent: () => ({
            rates: {},
            initialValues: {},
            duration: 10,
        }),
    };
}

/** Analyze a model using mass-action dynamics. */
export function MassAction(
    props: ModelAnalysisProps<MassActionProblemData> & {
        simulate: Simulator;
        isState?: (obType: ObType) => boolean;
        isTransition?: (morType: MorType) => boolean;
        isStochastic?: boolean;
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

    const [iterationCount, setIterationCount] = createSignal(1);

    const plotResult = createModelODEPlot(
        () => props.liveModel,
        (model: DblModel) => props.simulate(model, props.content),
        iterationCount,
    );

    function handleRerun() {
        setIterationCount(prev => prev + 1);
    }

    return (
        <div class="simulation">
            <Foldable title={props.title}>
                <div class="parameters">
                    <FixedTableEditor rows={obGenerators()} schema={obSchema} />
                    <FixedTableEditor rows={morGenerators()} schema={morSchema} />
                    <FixedTableEditor rows={[null]} schema={toplevelSchema} />
                    <Show when={props.isStochastic}>
                        <div class="iterations">
                            <p>
                                <span>Iteration #:</span>
                                &nbsp;
                                <span>{iterationCount()}</span>
                            </p>
                            <IconButton tooltip="Rerun" onClick={handleRerun}>
                                <RefreshIcon size={20} />
                            </IconButton>
                        </div>
                    </Show>
                </div>
            </Foldable>
            <ODEResultPlot result={plotResult()} />
        </div>
    );
}
