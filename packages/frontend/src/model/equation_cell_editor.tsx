import { deepEqual } from "fast-equals";
import { For, Show, createEffect, createMemo, createSignal, useContext } from "solid-js";
import invariant from "tiny-invariant";
import { P, match } from "ts-pattern";

import { type Completion, InlineInput, NameInput } from "catcolab-ui-components";
import type { DblModel, Mor, MorType, Ob, ObType, QualifiedLabel } from "catlog-wasm";
import type { Theory } from "../theory";
import { LiveModelContext } from "./context";
import type { EquationEditorProps } from "./editors";
import { obClasses } from "./object_cell_editor";

import arrowStyles from "../stdlib/arrow_styles.module.css";
import styles from "./equation_cell_editor.module.css";

type EquationCellInput = "name" | "lhs" | "rhs";

/** Extract the object an identity path is at, if `mor` is an identity path. */
function identityPathObject(mor: Mor): Ob | null {
    return match(mor)
        .with({ tag: "Composite", content: { tag: "Id", content: P.select() } }, (ob) => ob)
        .otherwise(() => null);
}

/** Number of edges in a simple-path morphism: 0 for identities, 1 for a basic
    morphism, n for `Mor::Composite(Path::Seq(xs))`. Other shapes return
    `Number.POSITIVE_INFINITY` so they sort last. */
function pathLength(mor: Mor): number {
    return match(mor)
        .with({ tag: "Composite", content: { tag: "Id" } }, () => 0)
        .with({ tag: "Basic" }, () => 1)
        .with({ tag: "Composite", content: { tag: "Seq", content: P.select() } }, (xs) => xs.length)
        .otherwise(() => Number.POSITIVE_INFINITY);
}

/** Extract the basic-object id from an Ob, if it is a basic object. */
function basicObId(ob: Ob | null): string | null {
    return match(ob)
        .with({ tag: "Basic", content: P.select() }, (id) => id)
        .otherwise(() => null);
}

/** Compute the domain object of a morphism using the model. */
function morDom(model: DblModel | undefined, mor: Mor | null): Ob | null {
    if (!model || !mor) {
        return null;
    }
    try {
        return model.dom(mor);
    } catch {
        return null;
    }
}

/** Compute the codomain object of a morphism using the model. */
function morCod(model: DblModel | undefined, mor: Mor | null): Ob | null {
    if (!model || !mor) {
        return null;
    }
    try {
        return model.cod(mor);
    } catch {
        return null;
    }
}

/** Editor for an equation cell in a model.

Layout: `[name] [lhs path picker] = [rhs path picker]`.

Each path picker shows a typeable list of every simple path in the model as
completions, each rendered diagrammatically (with leading domain object).
The RHS picker is filtered to only paths whose domain and codomain match
those of the LHS path, once one is chosen.
 */
export default function EquationCellEditor(props: EquationEditorProps) {
    const liveModel = useContext(LiveModelContext);
    invariant(liveModel, "Live model should be provided as context");

    const [activeInput, setActiveInput] = createSignal<EquationCellInput>("name");

    const elaborated = (): DblModel | undefined => liveModel().elaboratedModel();

    const setLhs = (mor: Mor | null) =>
        props.modifyEquation((eqn) => {
            eqn.lhs = mor;
        });

    const setRhs = (mor: Mor | null) =>
        props.modifyEquation((eqn) => {
            eqn.rhs = mor;
        });

    const setName = (name: string) =>
        props.modifyEquation((eqn) => {
            eqn.name = name;
        });

    /** All simple paths in the model, including identities, sorted by edge
        count (shortest first); ties broken by the iteration order from the
        wasm. */
    const allPaths = createMemo<Mor[]>(() => {
        const m = elaborated();
        if (!m) {
            return [];
        }
        try {
            const paths = m.listSimplePaths(undefined);
            return paths
                .map((mor, i) => ({ mor, i, len: pathLength(mor) }))
                .toSorted((a, b) => a.len - b.len || a.i - b.i)
                .map((x) => x.mor);
        } catch {
            return [];
        }
    });

    /** Domain and codomain of the LHS, used to filter the RHS picker. */
    const lhsDom = createMemo<Ob | null>(() => morDom(elaborated(), props.equation.lhs));
    const lhsCod = createMemo<Ob | null>(() => morCod(elaborated(), props.equation.lhs));

    /** Paths available for the RHS picker. Filters by dom/cod once LHS is set. */
    const rhsPaths = createMemo<Mor[]>(() => {
        const m = elaborated();
        const dom = lhsDom();
        const cod = lhsCod();
        if (!m || dom === null || cod === null) {
            return allPaths();
        }
        return allPaths().filter((mor) => {
            const d = morDom(m, mor);
            const c = morCod(m, mor);
            return d !== null && c !== null && deepEqual(d, dom) && deepEqual(c, cod);
        });
    });

    return (
        <div class={`formal-judgment ${styles["decl"]}`}>
            <div class={styles["name"]}>
                <NameInput
                    placeholder="Unnamed"
                    name={props.equation.name}
                    setName={setName}
                    isActive={props.isActive && activeInput() === "name"}
                    deleteBackward={props.actions.deleteBackward}
                    deleteForward={props.actions.deleteForward}
                    exitBackward={props.actions.activateAbove}
                    exitForward={() => setActiveInput("lhs")}
                    exitUp={props.actions.activateAbove}
                    exitDown={() => setActiveInput("lhs")}
                    exitRight={() => setActiveInput("lhs")}
                    createBelow={() => setActiveInput("lhs")}
                    hasFocused={() => {
                        setActiveInput("name");
                        props.actions.hasFocused?.();
                    }}
                />
            </div>
            <div class={styles["header"]}>
                <PathPicker
                    model={elaborated()}
                    theory={props.theory}
                    paths={allPaths()}
                    mor={props.equation.lhs}
                    setMor={setLhs}
                    isActive={props.isActive && activeInput() === "lhs"}
                    exitBackward={() => setActiveInput("name")}
                    exitForward={() => setActiveInput("rhs")}
                    exitUp={() => setActiveInput("name")}
                    exitDown={() => setActiveInput("rhs")}
                    exitLeft={() => setActiveInput("name")}
                    exitRight={() => setActiveInput("rhs")}
                    hasFocused={() => {
                        setActiveInput("lhs");
                        props.actions.hasFocused?.();
                    }}
                    createBelow={() => setActiveInput("rhs")}
                />
            </div>
            <div class={styles["equals"]}>{"="}</div>
            <div class={styles["rhsRow"]}>
                <PathPicker
                    model={elaborated()}
                    theory={props.theory}
                    paths={rhsPaths()}
                    mor={props.equation.rhs}
                    setMor={setRhs}
                    isActive={props.isActive && activeInput() === "rhs"}
                    exitBackward={() => setActiveInput("lhs")}
                    exitForward={props.actions.activateBelow}
                    exitUp={() => setActiveInput("lhs")}
                    exitDown={props.actions.activateBelow}
                    exitLeft={() => setActiveInput("lhs")}
                    exitRight={props.actions.activateBelow}
                    hasFocused={() => {
                        setActiveInput("rhs");
                        props.actions.hasFocused?.();
                    }}
                    createBelow={props.actions.activateBelow}
                />
            </div>
        </div>
    );
}

/** Picker for a path in the model.

When inactive and a path is set, renders the path diagrammatically
(`A —f→ B —g→ C`). When active, an `InlineInput` is shown with the supplied
list of paths as completions; a custom filter recognises path-syntax
conventions (`id(Foo)`, `f;g`) and a custom renderer draws each completion
diagrammatically.
 */
function PathPicker(props: {
    model: DblModel | undefined;
    theory: Theory;
    paths: Mor[];
    mor: Mor | null;
    setMor: (mor: Mor | null) => void;
    isActive: boolean;
    exitBackward?: () => void;
    exitForward?: () => void;
    exitUp?: () => void;
    exitDown?: () => void;
    exitLeft?: () => void;
    exitRight?: () => void;
    hasFocused?: () => void;
    createBelow?: () => void;
}) {
    /** The chosen path, if any. */
    const chosenPath = createMemo<Mor | null>(() => props.mor);

    /** Compute the typeable text for a path: morphism labels joined by `;`.
        Unlabelled morphisms show as "Unnamed". Identity paths show as
        `id(Object)`. */
    const pathText = (mor: Mor | null): string => {
        const m = props.model;
        if (!m || !mor) {
            return "";
        }
        const idOb = identityPathObject(mor);
        if (idOb !== null) {
            return identityText(m, idOb);
        }
        const segs = describePath(m, mor);
        return segs ? segs.morphisms.map((s) => s.label || "Unnamed").join(";") : "";
    };

    /** Free-form text in the input.

    Synced from the chosen path whenever the picker is not the active input,
    so re-entering edit mode pre-fills with the chosen path's name and the
    completions list is filtered to it.
     */
    const [text, setText] = createSignal("");
    const [unresolvedText, setUnresolvedText] = createSignal<string | null>(null);

    createEffect(() => {
        if (!props.isActive) {
            if (unresolvedText() === null) {
                setText(pathText(chosenPath()));
            }
        }
    });

    const commitTypedText = () => {
        const typed = text();
        if (typed.trim() === "") {
            setUnresolvedText(null);
            props.setMor(null);
            return;
        }
        const resolved = resolveTypedPath(typed, items());
        if (resolved) {
            setUnresolvedText(null);
            props.setMor(resolved);
            return;
        }
        props.setMor(null);
        setUnresolvedText(typed);
    };

    /** Build path-completion items (one per available path).

    Each item is a standard `Completion` (so it flows through `InlineInput`'s
    typed `completions` prop) augmented with a `path` field carrying the
    precomputed display data used by the custom filter and renderer. Items
    with no presentable segments are skipped. */
    const items = createMemo<PathCompletionItem[]>(() => {
        const m = props.model;
        if (!m) {
            return [];
        }
        const out: PathCompletionItem[] = [];
        for (const mor of props.paths) {
            const segs = describePath(m, mor);
            if (!segs) {
                continue;
            }
            const idOb = identityPathObject(mor);
            const name =
                idOb !== null
                    ? identityText(m, idOb)
                    : segs.morphisms.map((s) => s.label || "Unnamed").join(";");
            out.push({
                name,
                onComplete: () => {
                    setUnresolvedText(null);
                    setText(name);
                    props.setMor(mor);
                },
                mor,
                path: {
                    segments: segs,
                    isIdentity: idOb !== null,
                    nameLower: name.toLowerCase(),
                },
            });
        }
        return out;
    });

    /** Show the input only when the picker is the active input. The
        non-active state always renders a static display: the rendered path
        when one is chosen, or `...` placeholder when empty. */
    const showInput = () => props.isActive;

    const resolvedPath = createMemo(() => resolveTypedPath(text(), items()));

    return (
        <div
            class={styles["pathPicker"]}
            onMouseDown={(evt) => {
                // Activate the picker when clicking anywhere inside the
                // border, but only when not already in editing mode (so
                // selecting text in the input still works).
                if (!showInput()) {
                    props.hasFocused?.();
                    evt.preventDefault();
                }
            }}
        >
            <Show when={!showInput()}>
                <div class={styles["pathDisplay"]}>
                    <Show
                        when={unresolvedText()}
                        fallback={
                            <Show
                                when={chosenPath()}
                                fallback={<span class={styles["unnamed"]}>...</span>}
                            >
                                {(mor) => (
                                    <PathView
                                        model={props.model}
                                        theory={props.theory}
                                        mor={mor()}
                                    />
                                )}
                            </Show>
                        }
                    >
                        {(typed) => <span class={styles["unresolved"]}>{typed()}</span>}
                    </Show>
                </div>
            </Show>
            <Show when={showInput()}>
                <InlineInput
                    text={text()}
                    setText={setText}
                    placeholder="..."
                    status={
                        text().trim() === "" ? null : resolvedPath() !== null ? null : "incomplete"
                    }
                    completions={items()}
                    completionsFilter={(its, text) =>
                        filterPathCompletions(its as PathCompletionItem[], text)
                    }
                    completionsRenderItem={(item) => (
                        <PathCompletionRow
                            item={item as PathCompletionItem}
                            theory={props.theory}
                        />
                    )}
                    showCompletionsOnFocus={true}
                    popupClass={styles.completionsPopup}
                    completionsEmptyText="No matching paths found."
                    isActive={props.isActive}
                    hasFocused={props.hasFocused}
                    hasBlurred={commitTypedText}
                    createBelow={props.createBelow}
                    exitBackward={props.exitBackward}
                    exitForward={props.exitForward}
                    exitUp={props.exitUp}
                    exitDown={props.exitDown}
                    exitLeft={props.exitLeft}
                    exitRight={props.exitRight}
                />
            </Show>
        </div>
    );
}

function resolveTypedPath(typed: string, items: PathCompletionItem[]): Mor | null {
    const query = typed.trim().toLowerCase();
    if (query === "") {
        return null;
    }
    return items.find((item) => item.name.trim().toLowerCase() === query)?.mor ?? null;
}

/** A path completion item.

Stored as a regular `Completion` so it threads through `InlineInput`'s
`completions` prop without casts; an extra `path` field carries the data
the custom filter and renderer need (segments for rendering, lower-cased
name for matching).
 */
type PathCompletionItem = Completion & {
    mor: Mor;
    path: {
        segments: PathSegments;
        isIdentity: boolean;
        nameLower: string;
    };
};

/** Filter path completions, preserving input order (which is already sorted
    by edge count upstream in `allPaths`).

Filtering rules (case-insensitive):
- Empty input matches everything.
- `id`, `id(`, or `id(Foo)` matches every path (identity or otherwise) whose
  domain object's label starts with the prefix after the opening parenthesis.
  An empty prefix matches all paths. The identity at `Foo` is included
  because its domain object is `Foo`.
- `;`-separated tokens match composite paths whose successive morphism
  labels start with the corresponding tokens (an empty trailing token is
  ignored, so `f;` still matches paths starting with `f`).
- Otherwise, match against the synthesized name (startsWith → includes) or
  the path's domain-object label (so e.g. typing `obj` matches `id(object)`
  as well as any non-identity path starting at `object`).
 */
function filterPathCompletions(items: PathCompletionItem[], text: string): PathCompletionItem[] {
    const trimmed = text.trim();
    if (trimmed === "") {
        return items.slice();
    }
    const lower = trimmed.toLowerCase();

    // Domain-prefixed syntax: `id`, `id(`, `id(Foo`, `id(Foo)`. Matches any
    // path whose domain label starts with the prefix (including the
    // identity at that object, since its domain is the object).
    const idMatch = lower.match(/^id(?:\((.*?)\)?)?$/);
    if (idMatch !== null) {
        const innerPrefix = idMatch[1] ?? "";
        return items.filter((it) => {
            const label = (it.path.segments.dom.label || "Unnamed").toLowerCase();
            return innerPrefix === "" || label.startsWith(innerPrefix);
        });
    }

    // Composite-path syntax: `;`-separated label prefixes.
    if (lower.includes(";")) {
        const tokens = lower.split(";").map((t) => t.trim());
        // Drop a single trailing empty token so `f;` matches paths starting
        // with `f`. Other empty tokens (e.g. `f;;g`) prevent any match.
        if (tokens.length > 0 && tokens[tokens.length - 1] === "") {
            tokens.pop();
        }
        if (tokens.some((t) => t === "")) {
            return [];
        }
        return items.filter((it) => {
            if (it.path.isIdentity) {
                return false;
            }
            if (it.path.segments.morphisms.length < tokens.length) {
                return false;
            }
            return tokens.every((tok, i) => {
                const seg = it.path.segments.morphisms[i];
                invariant(seg, "tokens.length is bounded by morphisms.length");
                const label = (seg.label || "Unnamed").toLowerCase();
                return label.startsWith(tok);
            });
        });
    }

    // Fallback: match against the synthesized name or the domain-object
    // label. Domain-label matches let typing an object name surface every
    // path starting at that object (including its identity).
    const starts = items.filter(
        (it) => it.path.nameLower.startsWith(lower) || domLabel(it).startsWith(lower),
    );
    const startsSet = new Set(starts);
    const includes = items.filter(
        (it) =>
            !startsSet.has(it) &&
            (it.path.nameLower.includes(lower) || domLabel(it).includes(lower)),
    );
    return starts.concat(includes);
}

function domLabel(it: PathCompletionItem): string {
    return (it.path.segments.dom.label || "Unnamed").toLowerCase();
}

/** Render a path completion as a single row in the completions list:
    diagrammatic path on top, the typeable name underneath as a subtle
    caption. */
function PathCompletionRow(props: { item: PathCompletionItem; theory: Theory }) {
    return (
        <div class={styles["completionRow"]}>
            <PathSegmentsView segments={props.item.path.segments} theory={props.theory} />
            <div class={styles["completionName"]}>{props.item.name}</div>
        </div>
    );
}

/** Typeable text for an identity path at the given object: `id(Label)`. */
function identityText(model: DblModel, ob: Ob): string {
    const id = basicObId(ob);
    const label = id !== null ? labelToString(model.obGeneratorLabel(id)) : "";
    return `id(${label || "Unnamed"})`;
}

/** Render a simple path diagrammatically.

Uses the same arrow styling as `MorphismCellEditor`: a leading domain object,
followed by each segment rendered as `[name above arrow]  [cod object]`, with
arrow style and object/morphism classes coming from theory metadata. Identity
paths produce no segments, so they render as the styled object node alone.
 */
function PathView(props: { model: DblModel | undefined; theory: Theory; mor: Mor }) {
    const segments = createMemo(() => describePath(props.model, props.mor));

    return (
        <Show when={segments()} fallback={<span class={styles["error"]}>(invalid path)</span>}>
            {(segs) => <PathSegmentsView segments={segs()} theory={props.theory} />}
        </Show>
    );
}

function PathSegmentsView(props: { segments: PathSegments; theory: Theory }) {
    const domClasses = () => [
        styles["object"],
        ...obClasses(props.theory, props.segments.dom.obType),
    ];
    return (
        <div class={styles["path"]}>
            <div class={domClasses().join(" ")}>
                <LabelOrUnnamed name={props.segments.dom.label} />
            </div>
            <For each={props.segments.morphisms}>
                {(mor) => <PathSegmentView segment={mor} theory={props.theory} />}
            </For>
        </div>
    );
}

/** Render a single (morphism, codomain) segment of a path.

Mirrors the layout of `MorphismCellEditor`: the morphism name sits above an
arrow drawn in the theory's arrow style; the codomain is rendered with the
object type's CSS classes.
 */
function PathSegmentView(props: { segment: PathMorSegment; theory: Theory }) {
    const morTypeMeta = () =>
        props.segment.morType ? props.theory.modelMorTypeMeta(props.segment.morType) : undefined;

    const arrowClass = () => arrowStyles[morTypeMeta()?.arrowStyle ?? "default"];

    const nameClasses = () => [
        styles["morName"],
        arrowStyles.arrowName,
        ...(morTypeMeta()?.textClasses ?? []),
    ];

    const codClasses = () => [
        styles["object"],
        ...obClasses(props.theory, props.segment.cod.obType),
    ];

    return (
        <div class={styles["segment"]}>
            <div class={arrowStyles.arrowWithName}>
                <div class={nameClasses().join(" ")}>
                    <LabelOrUnnamed name={props.segment.label} />
                </div>
                <div class={[arrowStyles.arrowContainer, arrowClass()].join(" ")}>
                    <div class={[arrowStyles.arrow, arrowClass()].join(" ")} />
                </div>
            </div>
            <div class={codClasses().join(" ")}>
                <LabelOrUnnamed name={props.segment.cod.label} />
            </div>
        </div>
    );
}

/** Render a label, falling back to a styled "Unnamed" when empty. */
function LabelOrUnnamed(props: { name: string }) {
    return (
        <Show when={props.name} fallback={<span class={styles["unnamed"]}>Unnamed</span>}>
            {props.name}
        </Show>
    );
}

/** A single segment of a path: a morphism plus its codomain. */
type PathMorSegment = {
    label: string;
    morType: MorType | undefined;
    cod: PathObSegment;
};

/** An object as displayed in a path. */
type PathObSegment = {
    label: string;
    obType: ObType | undefined;
};

type PathSegments = {
    /** The path's domain (initial object). */
    dom: PathObSegment;
    /** N segments for a path of N morphisms. */
    morphisms: PathMorSegment[];
};

/** Compute display data for the segments making up a path.

Returns null if the morphism cannot be presented (e.g., contains
non-basic morphisms).
 */
function describePath(model: DblModel | undefined, mor: Mor): PathSegments | null {
    if (!model) {
        return null;
    }

    // Identity path: Mor::Composite(Path::Id(ob)). Display as just the object,
    // matching the leading-domain-object rendering of a regular path.
    const idOb = identityPathObject(mor);
    if (idOb !== null) {
        return { dom: describeObSegment(model, idOb), morphisms: [] };
    }

    // Single-morphism path written as Mor::Basic(uuid).
    const basicId = match(mor)
        .with({ tag: "Basic", content: P.select() }, (id) => id)
        .otherwise(() => null);
    if (basicId !== null) {
        const seg = describeMorSegment(model, basicId);
        if (!seg) {
            return null;
        }
        const dom = morDom(model, mor);
        return { dom: describeObSegment(model, dom), morphisms: [seg] };
    }

    // Composite sequence: Mor::Composite(Path::Seq([Mor::Basic, ...])).
    const seq = match(mor)
        .with(
            {
                tag: "Composite",
                content: { tag: "Seq", content: P.select() },
            },
            (xs) => xs,
        )
        .otherwise(() => null);
    if (seq === null || seq.length === 0) {
        return null;
    }
    const morphisms: PathMorSegment[] = [];
    for (const m of seq) {
        const id = match(m)
            .with({ tag: "Basic", content: P.select() }, (id) => id)
            .otherwise(() => null);
        if (id === null) {
            return null;
        }
        const seg = describeMorSegment(model, id);
        if (!seg) {
            return null;
        }
        morphisms.push(seg);
    }
    const dom = morDom(model, mor);
    return { dom: describeObSegment(model, dom), morphisms };
}

function describeMorSegment(model: DblModel, id: string): PathMorSegment | null {
    const pres = model.morPresentation(id);
    if (!pres) {
        return null;
    }
    return {
        label: labelToString(model.morGeneratorLabel(id)),
        morType: pres.morType,
        cod: describeObSegment(model, pres.cod),
    };
}

function describeObSegment(model: DblModel, ob: Ob | null): PathObSegment {
    if (ob === null) {
        return { label: "", obType: undefined };
    }
    const id = basicObId(ob);
    let obType: ObType | undefined;
    try {
        obType = model.obType(ob);
    } catch {
        obType = undefined;
    }
    return {
        label: id !== null ? labelToString(model.obGeneratorLabel(id)) : "",
        obType,
    };
}

/** Render a qualified label as a dotted string, or "" if no label is set.

The `""` case is handled by the consumer (typically rendered as a styled
"Unnamed" placeholder).
 */
function labelToString(label: QualifiedLabel | undefined): string {
    if (!label || label.length === 0) {
        return "";
    }
    return label.map((seg) => (typeof seg === "string" ? seg : String(seg))).join(".");
}
