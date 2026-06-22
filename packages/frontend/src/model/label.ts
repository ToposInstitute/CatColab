import type { QualifiedName, DblModel } from "catlog-wasm";

/** Get the label of a morphism if it exists, otherwise a label of the form "src->tgt" */
export function morLabelOrDefault(id: QualifiedName, model?: DblModel): string | undefined {
    if (!model) {
        return;
    }

    const label = model.morGeneratorLabel(id);
    if (label) {
        return label.join(".");
    }

    const mor = model.morPresentation(id);
    if (mor && mor.dom.tag === "Basic" && mor.cod.tag === "Basic") {
        const src = model.obGeneratorLabel(mor.dom.content);
        const tgt = model.obGeneratorLabel(mor.cod.content);
        if (src && tgt) {
            return `${src.join(".")}→${tgt.join(".")}`;
        }
    }
}
