import { createResource, For, Match, Switch } from "solid-js";

import { PanelHeader, Spinner } from "catcolab-ui-components";
import type { DblModel } from "catlog-wasm";
import type { DiagramAnalysisProps } from "../../analysis";
import "./tabular_view.css";

/** Create a table from row-wise data */
function createTable(headers: Array<string>, data: Array<Array<string>>) {
    return (
        <table class="tabular-view-table">
            {headers && (
                <thead>
                    <tr>
                        <For each={headers}>
                            {(header) => <th class="tabular-view-table">{header}</th>}
                        </For>
                    </tr>
                </thead>
            )}
            <tbody>
                <For each={data}>
                    {(row) => (
                        <tr>
                            <For each={row}>
                                {(cell) => <td class="tabular-view-table">{cell}</td>}
                            </For>
                        </tr>
                    )}
                </For>
            </tbody>
        </table>
    );
}

/** Given a schema (DblModel of ThSchema), a JSON output `rawdata` from Catlab,
    and a particular object `obname` in the schema, create an HTML table with
    the outgoing homs/attributes from that object.
*/
function createACSetTable(model: DblModel, rawdata: Record<string, string[]>, obId: string) {
    // The primary key of this table is given by `rawdata[obname]`
    const rows: Array<string> = rawdata[obId] || [];
    const obname = model.obGeneratorLabel(obId)?.join(".") || "";

    // Get the homs and attrs with source `obId`
    const outhoms = model.morGenerators().filter((morId) => {
        const mor = model.morPresentation(morId);
        return mor?.dom.tag === "Basic" && mor.dom.content === obId;
    });

    // Convert morgenerators to user-friendly names
    const headers = [obname].concat(
        outhoms.map((morId) => model.morGeneratorLabel(morId)?.join(".") ?? ""),
    );

    // Data for column from indexing rawdata
    const columnardata: Array<Array<string>> = [obId]
        .concat(outhoms)
        .map((m) => rawdata[m as keyof typeof rawdata] || [""]);

    // Convert columnar data to row data
    const data = Array.from(rows?.keys()).map((colIndex) =>
        columnardata.map((row) => row[colIndex] || ""),
    );

    return createTable(headers, data);
}

/** Stack tables on top of each other in a naive way, one per ob/attrtype */
function createACSet(model: DblModel, rawdata: Record<string, string[]>) {
    return (
        <div class="simulation">
            <PanelHeader title="Tabular view" />
            <For each={model?.obGenerators()}>{(ob) => createACSetTable(model, rawdata, ob)}</For>
        </div>
    );
}

/** Visualize a diagram in a model of ThSchema as a collection of tables.

Such a visualization makes sense for any discrete double theory and is in
general restricted to basic objects.
 */
export default function TabularView(
    props: DiagramAnalysisProps<Record<string, never>> & {
        title?: string;
    },
) {
    const [res] = createResource(
        () => {
            const model = props.liveDiagram.liveModel.elaboratedModel();
            const diagram = props.liveDiagram.elaboratedDiagram();
            if (model && diagram) {
                return { model, diagram };
            }
        },

        async ({ model, diagram }) => {
            const response = await fetch("http://127.0.0.1:8080/acsetcolim", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: model.presentation(),
                    diagram: diagram.presentation(),
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return { model, data: await response.json() };
        },
    );
    return (
        <Switch>
            <Match when={res.loading}>
                <Spinner />
                <div>⏳ Loading model...</div>
            </Match>
            <Match when={res.error}>
                <div>❌ Error loading model: {res.error?.message || "Unknown error"}</div>
            </Match>
            <Match when={res()}>
                {(data) => {
                    const result = data();
                    return <div>{createACSet(result.model, result.data)}</div>;
                }}
            </Match>
        </Switch>
    );
}
