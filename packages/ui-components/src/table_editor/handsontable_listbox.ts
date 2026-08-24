import Handsontable from "./handsontable_core.js";

type ListboxEditor = Handsontable._editors.Autocomplete & {
    htContainer: HTMLElement;
    htEditor?: Handsontable & { flipped?: boolean };
};

let patched = false;

/** Portal Handsontable dropdowns to the viewport so scrolling panes cannot clip them. */
export function patchHandsontableListbox() {
    if (patched) {
        return;
    }
    patched = true;

    const prototype = Handsontable.editors.AutocompleteEditor.prototype as ListboxEditor;
    const baseCreateElements = prototype.createElements;
    prototype.createElements = function (this: ListboxEditor) {
        baseCreateElements.call(this);
        Object.assign(this.htContainer.style, {
            position: "fixed",
            zIndex: "1059",
        });
        this.htContainer.addEventListener("mousedown", (event) => event.stopPropagation());
        document.body.appendChild(this.htContainer);
        this.instance.addHook("afterDestroy", () => this.htContainer.remove());
    };

    const baseOpen = prototype.open;
    prototype.open = function (this: ListboxEditor) {
        this.htContainer.style.top = "-9999px";
        this.htContainer.style.left = "-9999px";
        baseOpen.call(this);
    };

    prototype.flipDropdownIfNeeded = function (this: ListboxEditor) {
        const editor = this.htEditor;
        if (!editor) {
            return;
        }

        const cell = this.TEXTAREA.getBoundingClientRect();
        let height = this.getDropdownHeight();
        const spaceAbove = cell.top;
        const spaceBelow = window.innerHeight - cell.bottom;
        const flipped = height > spaceBelow && spaceAbove > spaceBelow;
        const availableSpace = Math.floor(flipped ? spaceAbove : spaceBelow);
        if (height > availableSpace) {
            const rowHeight = editor.getRowHeight(0) || 23;
            height = Math.max(rowHeight, availableSpace - (availableSpace % rowHeight));
            this.setDropdownHeight(height);
        }

        this.htContainer.style.left = `${cell.left}px`;
        this.htContainer.style.top = `${flipped ? cell.top - height : cell.bottom}px`;
        editor.flipped = flipped || undefined;
    };
}
