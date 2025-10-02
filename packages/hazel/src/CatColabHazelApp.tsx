import { Repo } from "@automerge/automerge-repo";
import type { AutomergeUrl } from "@automerge/automerge-repo";
import { Match, Switch, createEffect, createResource, createSignal } from "solid-js";
import { getLiveModelFromRepo, newModelDocument } from "../../frontend/src/model/document";
import { ModelPane } from "../../frontend/src/model/model_editor";
import { TheoryLibraryContext, stdTheories } from "../../frontend/src/stdlib";
import { useHazelIntegration } from "./hazel/useHazelIntegration";

export default function CatColabHazelApp(_props: Record<string, never>) {
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
                const parsed: unknown = valueStr ? JSON.parse(valueStr) : null;
                const isModelDoc =
                    parsed != null &&
                    typeof parsed === "object" &&
                    (parsed as { type?: unknown }).type === "model";
                const initial = isModelDoc ? (parsed as object) : newModelDocument("empty");
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
            if (c.minWidth != null) document.body.style.minWidth = `${c.minWidth}px`;
            if (c.minHeight != null) document.body.style.minHeight = `${c.minHeight}px`;
        },
    });

    const [liveModel] = createResource(
        () => docUrl(),
        async (url) => {
            if (!url) throw new Error("docUrl not set yet");
            return await getLiveModelFromRepo(url, repo() as unknown as any, stdTheories);
        },
    );

    createEffect(() => {
        const lm = liveModel();
        if (!lm) return;

        /* for now i'm just sending over a summary of the contents of the model to hazel... */
        const judgments = lm.formalJudgments();
        let objects = 0;
        let morphisms = 0;
        for (const j of judgments) {
            const tag = (j as { tag?: string }).tag;
            if (tag === "object") objects++;
            else if (tag === "morphism") morphisms++;
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
