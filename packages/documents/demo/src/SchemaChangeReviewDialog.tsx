import { Attr } from "catcolab-logics/simple-schema";
import { createMemo, createSignal, For, Show } from "solid-js";

import type { NotebookCell } from "catcolab-documents";
import { type FloatToIntegerRule, planFloatToIntegerMigration } from "./attribute-type-migration";
import type { DemoDocument } from "./document";
import { rowShortLabel } from "./instance-model";
import { SketchArrow } from "./Rough";

import instanceStyles from "./InstanceTable.module.css";
import styles from "./SchemaChangeReviewDialog.module.css";
import schemaStyles from "./SchemaEditor.module.css";

const RULES: Array<{ value: FloatToIntegerRule; label: string; description: string }> = [
    {
        value: "round",
        label: "Round",
        description: "Round fractional values to the nearest integer.",
    },
    {
        value: "truncate",
        label: "Truncate",
        description: "Remove the fractional part, moving values toward zero.",
    },
    {
        value: "clear",
        label: "Clear incompatible values",
        description: "Keep whole numbers and leave every other affected cell empty.",
    },
];

export function SchemaChangeReviewDialog(props: {
    doc: DemoDocument;
    attribute: NotebookCell<typeof Attr>;
    onCancel: () => void;
    onApplied: () => void;
}) {
    const [rule, setRule] = createSignal<FloatToIntegerRule>("round");
    const [applyError, setApplyError] = createSignal<string>();
    const [editedValues, setEditedValues] = createSignal<Record<string, string>>({});
    const plan = createMemo(() => {
        props.doc.trackInstance();
        return planFloatToIntegerMigration(props.doc, props.attribute, rule());
    });
    const afterText = (rowId: string, output: number | undefined) =>
        editedValues()[rowId] ?? (output === undefined ? "" : String(output));
    const parsedValues = createMemo(() => {
        const values = new Map<string, number | undefined>();
        const invalid = new Set<string>();
        for (const row of plan().rows) {
            const parsed = parseInteger(afterText(row.rowId, row.output));
            if (parsed.valid) {
                values.set(row.rowId, parsed.value);
            } else {
                invalid.add(row.rowId);
            }
        }
        return { values, invalid };
    });

    const apply = () => {
        if (parsedValues().invalid.size > 0) {
            return;
        }
        try {
            props.doc.applyFloatToIntegerMigration(props.attribute, rule(), parsedValues().values);
            props.onApplied();
        } catch (error) {
            setApplyError(error instanceof Error ? error.message : String(error));
        }
    };

    return (
        <wired-dialog open elevation="4">
            <div class={styles.dialog} role="dialog" aria-labelledby="schema-change-title">
                <header class={styles.header}>
                    <p class={styles.eyebrow}>Schema change</p>
                    <h2 id="schema-change-title">Review attribute type change</h2>
                    <p>
                        Changing this attribute to an integer requires a decision for fractional
                        values. The schema and its data will update together.
                    </p>
                </header>

                <div class={styles.declaration}>
                    <div>
                        <span>Current</span>
                        <MorphismPreview
                            domain={props.attribute.from?.label || "(unnamed)"}
                            name={props.attribute.label || "(unnamed)"}
                            codomain="Float"
                        />
                    </div>
                    <div>
                        <span>Proposed</span>
                        <MorphismPreview
                            domain={props.attribute.from?.label || "(unnamed)"}
                            name={props.attribute.label || "(unnamed)"}
                            codomain="Integer"
                        />
                    </div>
                </div>

                <section class={styles.section}>
                    <div class={styles.summary}>
                        <div>
                            <strong>{plan().summary.total}</strong>
                            <span>rows checked</span>
                        </div>
                        <div>
                            <strong>{plan().summary.converted}</strong>
                            <span>converted</span>
                        </div>
                        <div>
                            <strong>{plan().summary.cleared}</strong>
                            <span>cleared</span>
                        </div>
                        <div classList={{ [styles.problem ?? ""]: plan().summary.unresolved > 0 }}>
                            <strong>{plan().summary.unresolved}</strong>
                            <span>unresolved</span>
                        </div>
                    </div>
                </section>

                <fieldset class={styles.rules}>
                    <legend>Convert incompatible values</legend>
                    <wired-radio-group
                        selected={rule()}
                        on:selected={(event) => {
                            setApplyError(undefined);
                            setEditedValues({});
                            setRule(event.detail.selected as FloatToIntegerRule);
                        }}
                    >
                        <For each={RULES}>
                            {(option) => (
                                <wired-radio
                                    name={option.value}
                                    checked={rule() === option.value}
                                    classList={{
                                        [styles.selected ?? ""]: rule() === option.value,
                                    }}
                                >
                                    <span>
                                        <strong>{option.label}</strong>
                                        <small>{option.description}</small>
                                    </span>
                                </wired-radio>
                            )}
                        </For>
                    </wired-radio-group>
                </fieldset>

                <section class={styles.section}>
                    <div class={styles.previewHeading}>
                        <h3>Preview</h3>
                        <span>{plan().rows.length} rows</span>
                    </div>
                    <Show
                        when={plan().rows.length > 0}
                        fallback={<p class={styles.noChanges}>This entity has no rows.</p>}
                    >
                        <div class={styles.tableScroller}>
                            <div class={instanceStyles.table}>
                                <div class={instanceStyles.tableHeader}>
                                    <span class={instanceStyles.entityName}>
                                        {props.attribute.from?.label || "(unnamed entity)"}
                                    </span>
                                </div>
                                <table class={`jss_worksheet ${styles.preview}`}>
                                    <thead>
                                        <tr>
                                            <td aria-hidden="true" />
                                            <td data-x="0">Row</td>
                                            <td data-x="1">Before</td>
                                            <td data-x="2">After</td>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <For each={plan().rows}>
                                            {(row, index) => (
                                                <tr>
                                                    <td>{index() + 1}</td>
                                                    <td>
                                                        {props.attribute.from
                                                            ? rowShortLabel(
                                                                  props.doc,
                                                                  props.attribute.from,
                                                                  row.row,
                                                              )
                                                            : row.rowId}
                                                    </td>
                                                    <td>{formatValue(row.input)}</td>
                                                    <td
                                                        classList={{
                                                            [styles.invalidCell ?? ""]:
                                                                parsedValues().invalid.has(
                                                                    row.rowId,
                                                                ),
                                                        }}
                                                    >
                                                        <input
                                                            class={styles.afterInput}
                                                            type="number"
                                                            step="1"
                                                            min="-2147483648"
                                                            max="2147483647"
                                                            aria-label={`New value for ${
                                                                props.attribute.from
                                                                    ? rowShortLabel(
                                                                          props.doc,
                                                                          props.attribute.from,
                                                                          row.row,
                                                                      )
                                                                    : row.rowId
                                                            }`}
                                                            aria-invalid={parsedValues().invalid.has(
                                                                row.rowId,
                                                            )}
                                                            value={afterText(row.rowId, row.output)}
                                                            placeholder="Empty"
                                                            onInput={(event) =>
                                                                setEditedValues((current) => ({
                                                                    ...current,
                                                                    [row.rowId]:
                                                                        event.currentTarget.value,
                                                                }))
                                                            }
                                                        />
                                                    </td>
                                                </tr>
                                            )}
                                        </For>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </Show>
                </section>

                <Show when={plan().summary.unresolved > 0}>
                    <p class={styles.warning} role="alert">
                        Some values could not be converted automatically. Review their editable
                        <strong> After</strong> values before applying the change.
                    </p>
                </Show>
                <Show when={parsedValues().invalid.size > 0}>
                    <p class={styles.warning} role="alert">
                        After values must be empty or signed 32-bit integers.
                    </p>
                </Show>
                <Show when={applyError()}>
                    {(message) => <p class={styles.warning}>{message()}</p>}
                </Show>

                <footer class={styles.actions}>
                    <wired-button onClick={props.onCancel}>Cancel</wired-button>
                    <wired-button disabled={parsedValues().invalid.size > 0} onClick={apply}>
                        Apply change
                    </wired-button>
                </footer>
            </div>
        </wired-dialog>
    );
}

function MorphismPreview(props: { domain: string; name: string; codomain: string }) {
    return (
        <div
            class={`${schemaStyles.formalJudgment} ${schemaStyles.morphismDecl} ${styles.morphism}`}
        >
            <span class={`${schemaStyles.endpoint} ${schemaStyles.code}`}>{props.domain}</span>
            <div class={schemaStyles.arrowWithName}>
                <span class={`${schemaStyles.arrowName} ${schemaStyles.code}`}>{props.name}</span>
                <div class={schemaStyles.arrowContainer}>
                    <SketchArrow />
                </div>
            </div>
            <span class={`${schemaStyles.endpoint} ${schemaStyles.code}`}>{props.codomain}</span>
        </div>
    );
}

function formatValue(value: unknown): string {
    if (value === undefined) {
        return "Empty";
    }
    if (typeof value === "number") {
        return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
    }
    return String(value);
}

function parseInteger(text: string): { valid: true; value: number | undefined } | { valid: false } {
    if (text === "") {
        return { valid: true, value: undefined };
    }
    if (!/^-?\d+$/.test(text)) {
        return { valid: false };
    }
    const value = Number(text);
    return Number.isInteger(value) && value >= -2_147_483_648 && value <= 2_147_483_647
        ? { valid: true, value }
        : { valid: false };
}
