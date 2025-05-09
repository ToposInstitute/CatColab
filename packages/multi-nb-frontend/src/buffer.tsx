import { createSignal, For, JSX, Match, Switch, useContext } from "solid-js";
import { LiveDoc, LIVEDOC_CONTEXT } from "./use-livedoc";
import { v7 } from "uuid";
import {
    elaborate,
    ElaborationResult,
    ErrorMessage,
    RawCell,
    RawCellType,
    RawNotebook,
} from "catlaborator";
import { useDocuments } from "./use-documents";

function asString(c: RawCellType): { value: string } | undefined {
    if (c.tag == "String") {
        return { value: c.value };
    }
}

function asDocumentId(c: RawCellType): { value: string } | undefined {
    if (c.tag == "Notebook") {
        return { value: c.value };
    }
}

function InlineInput(
    props: { value: string | undefined; setValue: (newValue: string) => void },
): JSX.Element {
    return (
        <div class="inline-input-container">
            <span class="inline-input-filler">{props.value}</span>
            <input
                type="text"
                class="inline-input"
                size="1"
                value={props.value}
                onInput={(ev) => props.setValue(ev.target.value)}
            >
            </input>
        </div>
    );
}

function Cell(
    props: {
        value: RawCell;
        updateValue: (f: (newValue: RawCell) => void) => void;
        close: () => void;
        errors: ErrorMessage[] | undefined;
    },
) {
    return (
        <div class="cell">
            <div class="cell-editor">
                <button onClick={props.close}>x</button>
                <InlineInput
                    value={props.value.name}
                    setValue={(newName) =>
                        props.updateValue((c) => {
                            c.name = newName;
                        })}
                />
                <span>:</span>
                <Switch>
                    <Match when={asString(props.value.ty)}>
                        {(ty) => (
                            <InlineInput
                                value={ty().value}
                                setValue={(newString) => {
                                    props.updateValue((c) => {
                                        c.ty = {
                                            tag: "String",
                                            value: newString,
                                        };
                                    });
                                }}
                            />
                        )}
                    </Match>
                    <Match when={asDocumentId(props.value.ty)}>
                        {(ty) => (
                            <select
                                value={ty().value}
                                onInput={(ev) =>
                                    props.updateValue((c) => {
                                        c.ty = {
                                            tag: "Notebook",
                                            value: ev.target.value,
                                        };
                                    })}
                            >
                                <For
                                    each={useDocuments()?.value.allDocumentIds}
                                >
                                    {(docId) => (
                                        <option value={docId as string}>
                                            {docId as string}
                                        </option>
                                    )}
                                </For>
                            </select>
                        )}
                    </Match>
                </Switch>
            </div>
            <div class="cell-errors">
                <Switch>
                    <Match
                        when={props.errors && props.errors.length > 0 &&
                            props.errors}
                    >
                        {(errors) => (
                            <ul>
                                <For each={errors()}>
                                    {(error) => {
                                        let displayedSource = undefined;
                                        if (error.pos) {
                                            const source = props.value.ty.value;
                                            displayedSource = (
                                                <p>
                                                    {source.slice(
                                                        0,
                                                        error.pos[0],
                                                    )}
                                                    <span style="color: red">
                                                        {source.slice(
                                                            error.pos[0],
                                                            error.pos[1],
                                                        )}
                                                    </span>
                                                    {source.slice(error.pos[1])}
                                                </p>
                                            );
                                        }
                                        return (
                                            <li>
                                                {displayedSource}
                                                <p>{error.message}</p>
                                            </li>
                                        );
                                    }}
                                </For>
                            </ul>
                        )}
                    </Match>
                    <Match when={props.errors && props.errors.length == 0}>
                        <span>✓</span>
                    </Match>
                    <Match when={props.errors === undefined}>
                        <span>?</span>
                    </Match>
                </Switch>
            </div>
        </div>
    );
}

function newPrimitiveCell(s: RawNotebook) {
    const id = v7();
    s.cellContent[id] = { name: "", ty: { tag: "String", value: "" } };
    s.order.push(id);
}

function newNotebookCell(s: RawNotebook) {
    const id = v7();
    s.cellContent[id] = { name: "", ty: { tag: "Notebook", value: "" } };
    s.order.push(id);
}

export function Buffer(props: { livedoc: LiveDoc<RawNotebook> }) {
    const [errors, setErrors] = createSignal<ElaborationResult>({
        errors: new Map(),
    });
    const documents = useDocuments();
    if (!documents) {
        throw new Error("must provide document context");
    }
    const livedocs = useContext(LIVEDOC_CONTEXT);
    if (!livedocs) {
        throw new Error("must provide livedoc context");
    }
    const constructDatabase = async () => {
        const database = new Map<string, RawNotebook>();

        for (const docId of documents.value.allDocumentIds) {
            const doc = await livedocs.repo.find(docId).doc();
            console.log(doc);
            const cleanedDoc = JSON.parse(JSON.stringify(doc));
            console.log(cleanedDoc);
            database.set(docId as string, cleanedDoc);
        }

        return database;
    };
    const update = (f: (nb: RawNotebook) => void) => {
        setErrors({ errors: new Map() });
        props.livedoc.update(f);
    };
    return (
        <div class="notebook">
            <input
                name="title"
                class="title"
                type="text"
                value={props.livedoc.value.title}
                onInput={(ev) =>
                    props.livedoc.update((s) => {
                        s.title = ev.target.value;
                    })}
            />
            <ul>
                <For each={props.livedoc.value.order}>
                    {(cellId, i) => (
                        <li>
                            <Cell
                                value={props.livedoc.value.cellContent[cellId]!}
                                updateValue={(f) => {
                                    update((s) => {
                                        f(s.cellContent[cellId]!);
                                    });
                                }}
                                close={() => {
                                    update((s) => {
                                        delete s.cellContent[cellId];
                                        s.order.splice(i(), 1);
                                    });
                                }}
                                errors={errors().errors.get(cellId)}
                            />
                        </li>
                    )}
                </For>
            </ul>
            <button onClick={() => update(newPrimitiveCell)}>
                New Primitive Cell
            </button>
            <button onClick={() => update(newNotebookCell)}>
                New Notebook Cell
            </button>
            <button
                onClick={async () =>
                    setErrors(elaborate(
                        {
                            notebooks: await constructDatabase(),
                        },
                        props.livedoc.documentId as string,
                    ))}
            >
                Check
            </button>
        </div>
    );
}
