import download from "js-file-download";
import CircleHelp from "lucide-solid/icons/circle-help";
import Copy from "lucide-solid/icons/copy";
import DownloadIcon from "lucide-solid/icons/download";
import { type Accessor, createMemo, Match, Switch } from "solid-js";

import {
    BlockTitle,
    type ColumnSchema,
    createNumericalColumn,
    ErrorAlert,
    FixedTableEditor,
    IconButton,
} from "catcolab-ui-components";
import type { DblModel, ModelicaExportData, ModelicaResult } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import type { ValidatedModel } from "../../model";

import "./simulation.css";

/** Signature for a Modelica-emitting analysis backend. */
export type ModelicaExporter = (model: DblModel, data: ModelicaExportData) => ModelicaResult;

const copyToClipboard = (text: string) => navigator.clipboard.writeText(text);

const helpTooltip = () => (
    <>
        <p>
            Modelica is a declarative language for component-oriented modelling of physical systems.
            This analysis renders the model's ODE system as a self-contained Modelica{" "}
            <code>model</code> block.
        </p>
        <p>
            All parameters are declared with default value <code>1.0</code> and all state variables
            with <code>start = 1.0</code>; edit these in your Modelica tooling (OpenModelica,
            Dymola, …) to set concrete values.
        </p>
    </>
);

function ModelicaToolbar(props: { source: string; filename: string }) {
    return (
        <div
            style={{
                display: "flex",
                "align-items": "center",
                "justify-content": "flex-end",
                gap: "4px",
            }}
        >
            <IconButton
                onClick={() => copyToClipboard(props.source)}
                disabled={false}
                tooltip="Copy Modelica to clipboard"
            >
                <Copy size={16} />
            </IconButton>
            <IconButton
                onClick={() => download(props.source, props.filename, "text/x-modelica")}
                disabled={false}
                tooltip={`Download ${props.filename}`}
            >
                <DownloadIcon size={16} />
            </IconButton>
            <IconButton tooltip={helpTooltip()}>
                <CircleHelp size={16} />
            </IconButton>
        </div>
    );
}

/**
 * Analysis that emits Modelica source code for the model's ODE system.
 *
 * UI mirrors the SQL-export analysis: a `BlockTitle` with toolbar actions
 * (copy/download/help) and a settings pane for the model name + experiment
 * time span, plus a read-only `<pre>` source view below.
 */
export default function ModelicaExportAnalysis(
    props: ModelAnalysisProps<ModelicaExportData> & {
        generate: ModelicaExporter;
        title?: string;
    },
) {
    const result = createModelicaResult(
        () => props.liveModel.validatedModel(),
        (model) => props.generate(model, props.content),
    );

    const filename = () => `${result()?.modelName ?? "Model"}.mo`;

    const settingsSchema: ColumnSchema<null>[] = [
        {
            contentType: "string",
            name: "Model name",
            content: (_) => props.content.modelName,
            setContent: (_, content) => {
                props.changeContent((c) => {
                    c.modelName = content;
                });
                return true;
            },
        },
        createNumericalColumn({
            name: "Start time",
            data: (_) => props.content.startTime,
            setData: (_, data) =>
                props.changeContent((c) => {
                    c.startTime = data;
                }),
        }),
        createNumericalColumn({
            name: "Stop time",
            data: (_) => props.content.stopTime,
            validate: (_, data) => data >= props.content.startTime,
            setData: (_, data) =>
                props.changeContent((c) => {
                    c.stopTime = data;
                }),
        }),
    ];

    const settingsPane = (
        <div style={{ padding: "16px" }}>
            <FixedTableEditor rows={[null]} schema={settingsSchema} />
        </div>
    );

    return (
        <div class="simulation">
            <Switch>
                <Match when={result()?.source}>
                    {(source) => (
                        <>
                            <BlockTitle
                                title={props.title}
                                actions={
                                    <ModelicaToolbar source={source()} filename={filename()} />
                                }
                                settingsPane={settingsPane}
                            />
                            <pre class="modelica-source">{source()}</pre>
                        </>
                    )}
                </Match>
                <Match when={true}>
                    <BlockTitle title={props.title} settingsPane={settingsPane} />
                    <ErrorAlert>
                        <p>
                            The model is not valid yet — fix outstanding errors to generate Modelica
                            source.
                        </p>
                    </ErrorAlert>
                </Match>
            </Switch>
        </div>
    );
}

/** Reactively run a Modelica exporter against the current validated model. */
function createModelicaResult(
    validatedModel: Accessor<ValidatedModel | undefined>,
    generate: (model: DblModel) => ModelicaResult,
) {
    const result = createMemo<ModelicaResult | undefined>(
        () => {
            const validated = validatedModel();
            if (validated?.tag !== "Valid") {
                return;
            }
            try {
                return generate(validated.model);
            } catch {
                return;
            }
        },
        undefined,
        { equals: false },
    );
    return result;
}
