import {
    createEffect,
    createResource,
    Match,
    Switch,
    createSignal,
} from "solid-js";
import { Repo } from "@automerge/automerge-repo";
import type { AutomergeUrl } from "@automerge/automerge-repo";
import { useHazelIntegration } from "./hazel/useHazelIntegration";
import {
    getLiveModelFromRepo,
    newModelDocument,
} from "../../frontend/src/model/document";
import { ModelPane } from "../../frontend/src/model/model_editor";
import { stdTheories, TheoryLibraryContext } from "../../frontend/src/stdlib";

export default function CatColabHazelApp(_props: {}) {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get("id") || "local-demo";
    const codec = "json";

    const [docUrl, setDocUrl] = createSignal<AutomergeUrl | null>(null);
    const [repo] = createSignal<Repo>(new Repo());

    const { setSyntax } = useHazelIntegration({
        id,
        codec,
        onInit: (valueStr) => {
            try {
                const parsed = valueStr ? JSON.parse(valueStr) : null;
                const initial =
                    parsed &&
                    typeof parsed === "object" &&
                    (parsed as any).type === "model"
                        ? parsed
                        : newModelDocument("empty");
                const handle = repo().create(initial);
                setDocUrl(handle.url as AutomergeUrl);
            } catch (e) {
                console.warn("payload invalid", e);
                const handle = repo().create(newModelDocument("empty"));
                setDocUrl(handle.url as AutomergeUrl);
            }
        },
        onConstraints: (c) => {
            document.body.style.maxWidth = `${c.maxWidth}px`;
            document.body.style.maxHeight = `${c.maxHeight}px`;
            if (c.minWidth != null)
                document.body.style.minWidth = `${c.minWidth}px`;
            if (c.minHeight != null)
                document.body.style.minHeight = `${c.minHeight}px`;
        },
    });

    const [liveModel] = createResource(
        () => docUrl(),
        async (url) => {
            if (!url) throw new Error("docUrl not set yet");
            return await getLiveModelFromRepo(url, repo() as any, stdTheories);
        }
    );

    createEffect(() => {
        const lm = liveModel();
        if (!lm) return;

        /* for now i'm just sending over a summary of the contents of the model to hazel... */
        const judgments = lm.formalJudgments();
        let objects = 0;
        let morphisms = 0;
        for (const j of judgments) {
            if ((j as any).tag === "object") objects++;
            else if ((j as any).tag === "morphism") morphisms++;
        }

        const payload = { objects, morphisms };
        setSyntax(JSON.stringify(payload));
    });

    return (
        <div
            style={{
                padding: "8px",
                "min-width": "680px",
                "min-height": "480px",
                "box-sizing": "border-box",
            }}
        >
            <div
                style={{
                    display: "flex",
                    "justify-content": "space-between",
                    gap: "4px",
                }}
            >
                <div>
                    <strong>CatColab 🆚 Hazel</strong>
                </div>
                {/* <button
                    onClick={() => {
                        const payload = "hello from catcolab";
                        setSyntax(JSON.stringify(payload));
                    }}
                >
                    Send setSyntax (stub)
                </button> */}
            </div>

            <Switch>
                <Match when={liveModel.loading}>
                    <div>loading...</div>
                </Match>
                <Match when={liveModel.error}>
                    <div>error: {liveModel.error?.message || "error"}</div>
                </Match>
                <Match when={liveModel()}>
                    {(lm) => (
                        <TheoryLibraryContext.Provider value={stdTheories}>
                            <ModelPane liveModel={lm()} />
                        </TheoryLibraryContext.Provider>
                    )}
                </Match>
            </Switch>
        </div>
    );
}
