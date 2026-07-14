import RotateCcw from "lucide-solid/icons/rotate-ccw";
import { createMemo, createSignal } from "solid-js";

import {
    BlockTitle,
    type ColumnSchema,
    createNumericalColumn,
    FixedTableEditor,
    Foldable,
    IconButton,
    CheckboxField,
    FormGroup,
} from "catcolab-ui-components";
import type {
    DblModel,
    MorType,
    ObType,
    QualifiedName,
    StochasticMassActionProblemData,
} from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import { morLabelOrDefault } from "../../model";
import { ODEResultPlot } from "../../visualization";
import { createModelODEPlot } from "./model_ode_plot";
import type { StochasticMassActionSimulator } from "./simulator_types";

import "./simulation.css";

/** Analyze a model using stochastic mass-action dynamics. */
export default function StochasticMassAction(
    props: ModelAnalysisProps<StochasticMassActionProblemData> & {
        simulate: StochasticMassActionSimulator;
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
    });

    const morGenerators = createMemo<QualifiedName[]>(() => {
        const model = elaboratedModel();
        if (!model) {
            return [];
        }
        return props.transitionType
            ? model.morGeneratorsWithType(props.transitionType)
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
            validate: (_, data) => data >= 0 && Number.isInteger(data),
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

    // Bump this counter to trigger re-run of stochastic simulation.
    const [rerunCount, setRerunCount] = createSignal(0);

    const plotResult = createModelODEPlot(
        () => props.liveModel.validatedModel(),
        (model: DblModel) => {
            rerunCount();
            return props.simulate(model, props.content);
        },
    );

    const RerunButton = () => (
        <IconButton
            onClick={() => setRerunCount((count) => count + 1)}
            tooltip="Re-run the stochastic simulation"
        >
            <RotateCcw size={16} />
        </IconButton>
    );

    return (
        <div class="simulation">
            <BlockTitle
                title={props.title}
                settingsPane={
                    <StochasticMassActionConfigForm
                        config={props.content}
                        changeConfig={props.changeContent}
                        useSetSeed={props.content.seed === null}
                    />
                }
                actions={RerunButton()} />
            <Foldable title="Parameters" defaultExpanded>
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


/** Form to configure a mass-action analysis. */
export function StochasticMassActionConfigForm(props: {
    config: StochasticMassActionProblemData;
    changeConfig: (f: (config: StochasticMassActionProblemData) => void) => void;
    useSetSeed: boolean;
}) {
    return (
        <FormGroup compact style={{ "min-width": "286px" }}>
            <CheckboxField
                label="Set random seed"
                checked={props.config.seed !== null}
                onChange={(evt) => {
                    props.changeConfig((content) => {
                        if (evt.currentTarget.checked) {
                            // TODO: this should work for e.g. 18446744073709551615
                            content.seed = 12;
                        } else {
                            content.seed = null;
                        }
                    });
                }}
            />
            {/*TODO: form to set custom seed*/}
        </FormGroup>
    );
}
