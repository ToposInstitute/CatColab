import type { Uuid } from "catlaborator";
import { For, Show } from "solid-js";
import { InlineInput } from "./inline_input";

type Path = {
    completedSegments: Uuid[];
    current: string | null;
};

type Completion = {
    id: Uuid;
    name: string;
    isComplete: boolean;
};

/** When a completion has been accepted, this adds it to the path */
function acceptCompletion(p: Path, c: Completion): Path {
    return {
        completedSegments: [...p.completedSegments, c.id],
        current: c.isComplete ? null : "",
    };
}

type PathCompleter = (path: Path) => Completion[];

type PathInputProps = {
    completer: PathCompleter;
    path: Path;
    setPath: (path: Path) => void;
};

/** This is a structure editor for expressions of the form `a.b.c` where
each segment is *resolved* to a UUID.
*/
export function PathInput(props: PathInputProps) {
    return (
        <div class="path-input">
            <div class="path">
                <For each={props.path.segments}>
                    {(segment: Uuid) => <span class="segment">{}</span>}
                </For>
            </div>
            <Show when={!props.path.isComplete}>
                <InlineInput />
            </Show>
        </div>
    );
}
