import { createEffect, For, Show } from "solid-js";

import type { DblModel, DblModelDiagram } from "catlog-wasm";
import type { DiagramAnalysisProps } from "../../analysis";
import { updateDebugData } from "../../debug/debug_store";
import type { Theory } from "../../theory";
import styles from "./diagram_table.module.css";

/** Configuration for table layout (minimal for now). */
export type TableConfig = Record<string, never>;

export const defaultTableConfig: TableConfig = {};

/** Visualize an instance as tables, based on the κ(X) construction.

Following Proposition 2.8 of arXiv:2510.08861, instances of a model X are
presheaves on κ(X). This gives a natural tabular representation where:
- Each entity type in the model becomes a table
- Each individual of that type becomes a row
- Each outgoing morphism type becomes a column
*/
export default function DiagramTable(
    props: DiagramAnalysisProps<TableConfig> & {
        title?: string;
    },
) {
    const tables = () => {
        const theory = props.liveDiagram.liveModel.theory();
        const model = props.liveDiagram.liveModel.elaboratedModel();
        const diagram = props.liveDiagram.elaboratedDiagram();
        if (theory && model && diagram) {
            return diagramToTables(diagram, model, theory);
        }
        return [];
    };

    // Update global debug store whenever data changes
    createEffect(() => {
        const theory = props.liveDiagram.liveModel.theory();
        const model = props.liveDiagram.liveModel.elaboratedModel();
        const diagram = props.liveDiagram.elaboratedDiagram();

        const debugInfo: Record<string, unknown> = {
            hasTheory: !!theory,
            hasModel: !!model,
            hasDiagram: !!diagram,
        };

        if (diagram) {
            const obGens = diagram.obGenerators();
            const morGens = diagram.morGenerators();
            debugInfo.obGenerators = obGens;
            debugInfo.morGenerators = morGens;
            debugInfo.obPresentations = obGens.map((id) => ({
                id,
                presentation: diagram.obPresentation(id),
            }));
            debugInfo.morPresentations = morGens.map((id) => ({
                id,
                presentation: diagram.morPresentation(id),
            }));
        }

        if (model) {
            debugInfo.modelObGenerators = model.obGenerators();
            debugInfo.modelMorGenerators = model.morGenerators();
        }

        debugInfo.computedTables = tables();

        updateDebugData(debugInfo);
    });

    return (
        <div class={styles.tableContainer}>
            <Show when={props.title}>
                <h3 class={styles.title}>{props.title}</h3>
            </Show>
            <For each={tables()}>
                {(table) => (
                    <div class={styles.tableWrapper}>
                        <h4 class={styles.tableName}>{table.name}</h4>
                        <Show
                            when={table.rows.length > 0}
                            fallback={<p class={styles.emptyMessage}>No individuals</p>}
                        >
                            <table class={styles.table}>
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <For each={table.columns}>
                                            {(col) => <th>{col.name}</th>}
                                        </For>
                                    </tr>
                                </thead>
                                <tbody>
                                    <For each={table.rows}>
                                        {(row) => (
                                            <tr>
                                                <td>{row.label}</td>
                                                <For each={table.columns}>
                                                    {(col) => (
                                                        <td>{row.values[col.id] ?? ""}</td>
                                                    )}
                                                </For>
                                            </tr>
                                        )}
                                    </For>
                                </tbody>
                            </table>
                        </Show>
                    </div>
                )}
            </For>
            <Show when={tables().length === 0}>
                <p class={styles.emptyMessage}>No tables to display</p>
            </Show>
        </div>
    );
}

/** A table representing individuals of an entity type. */
export interface EntityTable {
    /** ID of the entity type in the model. */
    typeId: string;
    /** Display name for the table. */
    name: string;
    /** Columns representing outgoing morphisms. */
    columns: TableColumn[];
    /** Rows representing individuals. */
    rows: TableRow[];
}

/** A column in an entity table (an outgoing morphism type). */
export interface TableColumn {
    /** ID of the morphism generator in the model. */
    id: string;
    /** Display name for the column. */
    name: string;
}

/** A row in an entity table (an individual). */
export interface TableRow {
    /** ID of the object generator in the diagram. */
    id: string;
    /** Display label for the row. */
    label: string;
    /** Values for each column (morphism targets). */
    values: Record<string, string>;
}

/** Convert a diagram to a collection of tables based on κ(X) structure. */
export function diagramToTables(
    diagram: DblModelDiagram,
    model: DblModel,
    _theory: Theory,
): EntityTable[] {
    // Group object generators by their "over" type in the model
    const obsByType = new Map<string, Array<{ id: string; label: string }>>();

    for (const id of diagram.obGenerators()) {
        const ob = diagram.obPresentation(id);
        if (!(ob && ob.over.tag === "Basic")) {
            continue;
        }
        const typeId = ob.over.content;
        const label = ob.label?.join(".") ?? id;

        if (!obsByType.has(typeId)) {
            obsByType.set(typeId, []);
        }
        obsByType.get(typeId)!.push({ id, label });
    }

    // Build morphism lookup: for each object, what morphisms originate from it?
    const morsByDom = new Map<
        string,
        Array<{ id: string; codId: string | null; codValue: string | null; overLabel: string }>
    >();

    for (const id of diagram.morGenerators()) {
        const mor = diagram.morPresentation(id);
        if (!(mor && mor.dom.tag === "Basic" && mor.over.tag === "Basic")) {
            continue;
        }
        const domId = mor.dom.content;
        const overLabel = model.morGeneratorLabel(mor.over.content)?.join(".") ?? mor.over.content;

        // Handle both references to objects and literal values
        let codId: string | null = null;
        let codValue: string | null = null;
        if (mor.cod.tag === "Basic") {
            codId = mor.cod.content;
        } else if (mor.cod.tag === "Literal") {
            // Extract the actual value from the LiteralValue structure
            const lit = mor.cod.content as { tag: string; content: unknown };
            codValue = formatLiteralValue(lit);
        } else {
            // For other values, convert to string representation
            codValue = JSON.stringify(mor.cod.content ?? mor.cod);
        }

        if (!morsByDom.has(domId)) {
            morsByDom.set(domId, []);
        }
        morsByDom.get(domId)!.push({ id, codId, codValue, overLabel });
    }

    // Get all morphism types from the model for column headers
    const morTypesByDom = new Map<string, Array<{ id: string; label: string }>>();

    for (const id of model.morGenerators()) {
        const mor = model.morPresentation(id);
        if (!(mor && mor.dom.tag === "Basic" && mor.cod.tag === "Basic")) {
            continue;
        }
        const domTypeId = mor.dom.content;
        const label = mor.label?.join(".") ?? id;

        if (!morTypesByDom.has(domTypeId)) {
            morTypesByDom.set(domTypeId, []);
        }
        morTypesByDom.get(domTypeId)!.push({ id, label });
    }

    // Build tables for each entity type that has individuals
    const tables: EntityTable[] = [];

    for (const [typeId, obs] of obsByType) {
        const typeLabel = model.obGeneratorLabel(typeId)?.join(".") ?? typeId;
        const morTypes = morTypesByDom.get(typeId) ?? [];

        // Build columns from morphism types
        const columns: TableColumn[] = morTypes.map((mt) => ({
            id: mt.id,
            name: mt.label,
        }));

        // Build rows from individuals
        const rows: TableRow[] = obs.map((ob) => {
            const values: Record<string, string> = {};
            const mors = morsByDom.get(ob.id) ?? [];

            // For each morphism from this object, find which column it belongs to
            for (const mor of mors) {
                let targetLabel: string;
                if (mor.codId !== null) {
                    // Reference to another object
                    const targetOb = diagram.obPresentation(mor.codId);
                    targetLabel = targetOb?.label?.join(".") ?? mor.codId;
                } else {
                    // Literal value (e.g., attribute value)
                    targetLabel = mor.codValue ?? "";
                }
                // Use the morphism's "over" as the column key
                values[mor.overLabel] = targetLabel;
            }

            // Match values to column IDs
            const rowValues: Record<string, string> = {};
            for (const col of columns) {
                rowValues[col.id] = values[col.name] ?? "";
            }

            return {
                id: ob.id,
                label: ob.label,
                values: rowValues,
            };
        });

        tables.push({
            typeId,
            name: typeLabel,
            columns,
            rows,
        });
    }

    return tables;
}

/** Format a literal value for display. */
function formatLiteralValue(lit: { tag: string; content: unknown }): string {
    switch (lit.tag) {
        case "String":
            return lit.content as string;
        case "Int":
        case "Float":
            return String(lit.content);
        case "Bool":
            return lit.content ? "true" : "false";
        default:
            return JSON.stringify(lit.content);
    }
}
