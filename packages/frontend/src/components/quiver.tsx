import type { Prop } from "@automerge/automerge";
import type { DocHandle } from "@automerge/automerge-repo";
import type { EditorView } from "prosemirror-view";

/** Optional props for `RichTextEditor` component.
 */
export type RichTextEditorOptions = {
    id?: unknown;
    // this is actually an init callback that returns the view
    ref?: (ref: EditorView) => void;
    placeholder?: string;

    deleteBackward?: () => void;
    deleteForward?: () => void;
    exitUp?: () => void;
    exitDown?: () => void;

    onFocus?: () => void;
};

export const QuiverCell = (
	props: {
		handle: DocHandle<unknown>;
		path: Prop[];
	} & RichTextEditorOptions,
) => {
	let editorRoot!: HTMLDivElement;

	props;

	return (
        <div class={`quiver-cell`}>
			<iframe class="quiver-embed" src="https://q.uiver.app/#q=WzAsMSxbMCwwLCJcXGJ1bGxldCJdLFswLDBdXQ==&embed" width="176" height="176" style="border-radius: 8px; border: none;"></iframe> 
            <div ref={editorRoot} />
        </div>
    );
}
