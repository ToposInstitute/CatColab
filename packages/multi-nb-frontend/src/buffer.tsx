import { For } from "solid-js";
import { LiveDoc } from "./use-livedoc";
import { v7 } from "uuid";
import { Notebook } from "./notebook";

type Uuid = string;

function Cell(
    props: {
        value: string | undefined;
        setValue: (newValue: string) => void;
        close: () => void;
    },
) {
    return (
        <div class="cell">
            <input
                type="text"
                value={props.value}
                onInput={(ev) => props.setValue(ev.target.value)}
            >
            </input>
            <button onClick={props.close}>x</button>
        </div>
    );
}

function newCell(s: Notebook) {
    const id = v7();
    s.cellContent[id] = "";
    s.order.push(id);
}

export function Buffer(props: { livedoc: LiveDoc<Notebook> }) {
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
                                value={props.livedoc.value.cellContent[cellId]}
                                setValue={(newValue) => {
                                    props.livedoc.update((s) => {
                                        s.cellContent[cellId] = newValue;
                                    });
                                }}
                                close={() => {
                                    props.livedoc.update((s) => {
                                        delete s.cellContent[cellId];
                                        s.order.splice(i(), 1);
                                    });
                                }}
                            />
                        </li>
                    )}
                </For>
            </ul>
            <button onClick={() => props.livedoc.update(newCell)}>
                New Cell
            </button>
        </div>
    );
}
