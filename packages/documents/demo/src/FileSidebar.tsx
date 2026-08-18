import File from "lucide-solid/icons/file";
import Menu from "lucide-solid/icons/menu";
import Table from "lucide-solid/icons/table";
import { For } from "solid-js";

import { SketchSeparator } from "./Rough";

import styles from "./FileSidebar.module.css";

/** A row in the mock file tree: a document name, its icon, and its depth. */
type MockFile = {
    name: string;
    type: "schema" | "instance";
    /** Indentation level, starting at 1 like the frontend's document tree. */
    indent: number;
    /** Whether the row is drawn as the currently open document. */
    active?: boolean;
};

/**
 * Hardcoded stand-ins for a user's documents. The demo has no real document
 * list, so these exist purely to sketch what the frontend's sidebar shows: the
 * demo's schema with its instance as a child.
 */
const MOCK_FILES: MockFile[] = [
    { name: "Schema", type: "schema", indent: 1, active: true },
    { name: "Instance", type: "instance", indent: 2 },
];

/**
 * A non-functional mockup of the frontend's document sidebar: a fixed left
 * panel listing (fake) files with type icons and tree indentation. It exists
 * to occupy the same space the real sidebar does; rows are inert, with no
 * hover or click affordances, and the right edge is a hand-drawn wave like
 * the demo's other panel seams.
 */
export function FileSidebar() {
    return (
        <div class={styles.sidebar}>
            <SketchSeparator edge="right" seed={61} />
            <div class={styles.header}>
                <Menu size={18} />
            </div>
            <div class={styles.tree}>
                <For each={MOCK_FILES}>
                    {(file) => (
                        <div
                            class={styles.file}
                            classList={{ [styles.active ?? ""]: file.active }}
                            style={{ "padding-left": `${file.indent * 16}px` }}
                        >
                            {file.type === "schema" ? <File size={16} /> : <Table size={16} />}
                            <div class={styles.fileName}>{file.name}</div>
                        </div>
                    )}
                </For>
            </div>
        </div>
    );
}
