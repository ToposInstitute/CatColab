import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { createShortcut, KbdKey } from "@solid-primitives/keyboard";
import { pointerHover } from "@solid-primitives/pointer";
pointerHover;

import "./command.css";


export type Command = {
    name: string;
    shortcut?: KbdKey[];
    execute: () => void;
};

/** A menu of commands that pop ups at a specific location.

Inspired by Notion's popup menus and
[`solid-command-palette`](https://github.com/itaditya/solid-command-palette)
 */
export function CommandPopup(props: {
    commands: Command[],
    close: () => void;
}) {
    let lastFocused: HTMLElement | null;

    const executeCommand = (index: number) => {
        props.commands[index].execute();
        lastFocused = null;
        props.close();
    }

    const [activeItem, setActiveItem] = createSignal(0);

    createShortcut(["ArrowUp"], () => {
        const i = activeItem();
        setActiveItem(Math.max(i - 1, 0));
    });
    createShortcut(["ArrowDown"], () => {
        const i = activeItem();
        const n = props.commands.length;
        setActiveItem(Math.min(i + 1, n - 1));
    });
    createShortcut(["Enter"], () => executeCommand(activeItem()));
    createShortcut(["Escape"], props.close);

    // Remove old focus when pop up is created, restore it when destroyed.
    onMount(() => {
        lastFocused = document.activeElement as HTMLElement;
        if (lastFocused) {
            lastFocused.blur();
        }
        onCleanup(() => {
            if (lastFocused) {
                lastFocused.focus();
            }
        });
    })

    return (
        <div class="command-popup">
        <ul role="listbox" class="command-list">
            <For each={props.commands}>
                {(command, i) =>
                    <li role="option"
                        classList={{"active": i() === activeItem()}}
                        use:pointerHover={() => setActiveItem(i())}
                        onClick={() => executeCommand(i())}
                    >
                        <div class="command-name">
                            {command.name}
                        </div>
                        <Show when={command.shortcut}>
                            <div class="command-shortcut">
                                <KbdShortcut shortcut={command.shortcut as KbdKey[]}/>
                            </div>
                        </Show>
                    </li>
                }
            </For>
        </ul>
        </div>
    );
}


const KbdShortcut = (props: {
    shortcut: KbdKey[],
}) => (
    <kbd class="shortcut">
        <For each={props.shortcut}>
            {(key) => (
                <kbd class="key">{key}</kbd>
            )}
        </For>
    </kbd>
);
