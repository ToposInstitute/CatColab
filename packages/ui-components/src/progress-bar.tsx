import { createSignal, onCleanup, Match, Switch } from "solid-js";

type StreamMsg =
  | { status: string }
  | { progress: number }
  | { data: unknown };

type ProgressState =
  | { phase: "idle" }
  | { phase: "status"; label: string }
  | { phase: "progress"; fraction: number }
  | { phase: "done" }
  | { phase: "error"; message: string };

export function ProgressBar(props: {
  progress: () => number | null;
  status: () => string | null;
}) {
  return (
    <Switch fallback="Running the simulation...">
      <Match when={props.status() === "initializing"}>Initializing simulation...</Match>
      <Match when={props.status() === "finalizing"}>Finalizing results...</Match>
      <Match when={props.progress() != null}>
        <div class="simulation-progress">
          <div class="progress-bar">
            <div
              class="progress-fill"
              style={{ width: `${(props.progress()! * 100).toFixed(0)}%` }}
            />
          </div>
          <span class="progress-label">
            {(props.progress()! * 100).toFixed(0)}%
          </span>
        </div>
      </Match>
    </Switch>
  );
}
