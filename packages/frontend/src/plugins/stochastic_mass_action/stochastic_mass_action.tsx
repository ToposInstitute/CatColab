import RotateCcw from "lucide-solid/icons/rotate-ccw";
import { createMemo, createSignal, Show } from "solid-js";

import {
    BlockTitle,
    type ColumnSchema,
    createNumericalColumn,
    FixedTableEditor,
    Foldable,
    IconButton,
    CheckboxField,
    FormGroup,
    InputField,
} from "catcolab-ui-components";
import {
    type DblModel,
    type QualifiedName,
    type StochasticMassActionProblemData,
    ThSymMonoidalCategory,
} from "catlog-wasm";
import type { ModelAnalysisBuilder, ModelAnalysisProps } from "../../analysis";
import { morLabelOrDefault } from "../../model";
import { createModelODEPlot, ODEResultPlot } from "../../visualization";

import "../../visualization/simulation.css";

/** Analyze a model using stochastic mass-action dynamics. */
export default {
    contentVersion: 0,
    initialContent: () => ({
        rates: {},
        initialValues: {},
        seed: null,
        duration: 10,
    }),
    component: StochasticMassAction,
} satisfies ModelAnalysisBuilder<StochasticMassActionProblemData>;

const thSymMonoidalCategory = new ThSymMonoidalCategory();

function StochasticMassAction(props: ModelAnalysisProps<StochasticMassActionProblemData>) {
    const elaboratedModel = () => props.liveModel.elaboratedModel();

    const obGenerators = createMemo<QualifiedName[]>(() => elaboratedModel()?.obGenerators() ?? []);

    const morGenerators = createMemo<QualifiedName[]>(
        () => elaboratedModel()?.morGenerators() ?? [],
    );

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
            return thSymMonoidalCategory.stochasticMassAction(model, props.content);
        },
    );

    const RerunButton = () => (
        <Show when={props.content.seed == null}>
            <IconButton
                onClick={() => setRerunCount((count) => count + 1)}
                tooltip="Re-run the stochastic simulation"
            >
                <RotateCcw size={16} />
            </IconButton>
        </Show>
    );

    return (
        <div class="simulation">
            <BlockTitle
                title="Stochastic mass-action dynamics"
                settingsPane={
                    <StochasticMassActionConfigForm
                        config={props.content}
                        changeConfig={props.changeContent}
                    />
                }
                actions={RerunButton()}
            />
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
}) {
    return (
        <FormGroup compact>
            <CheckboxField
                label="Fixed random seed"
                checked={props.config.seed != null}
                onChange={(evt) => {
                    props.changeConfig((content) => {
                        if (evt.currentTarget.checked) {
                            content.seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
                        } else {
                            content.seed = null;
                        }
                    });
                }}
            />
            <InputField
                type="number"
                label="Random seed"
                value={props.config.seed ?? ""}
                onChange={(evt) => {
                    const value = Number(evt.currentTarget.value);
                    if (Number.isInteger(value) && value >= 0) {
                        props.changeConfig((content) => {
                            content.seed = value;
                        });
                    }
                }}
            />
        </FormGroup>
    );
}
