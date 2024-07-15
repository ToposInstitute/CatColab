import { createSignal, For, Show } from "solid-js";
import { createShortcut, KbdKey } from "@solid-primitives/keyboard";
import { pointerHover } from "@solid-primitives/pointer";
pointerHover;

import "./command.css";


/** A command that can be executed.
 */
export type Command = {
    name: string;
    description?: string;
    shortcut?: KbdKey[];
    execute: () => void;
};

/** A menu of commands that can be executed.

Intended to be embedded in a command popover inspired by Notion's popup menus
and [`solid-command-palette`](https://github.com/itaditya/solid-command-palette)
 */
export function CommandMenu(props: {
    commands: Command[],
    onExecuted?: (command: Command) => void;
}) {
    const executeCommand = (index: number) => {
        const command = props.commands[index];
        command.execute();
        props.onExecuted?.(command);
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

    return (
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
