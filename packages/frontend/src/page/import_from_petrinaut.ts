import { v7 } from "uuid";

import {
    currentVersion,
    type Document,
    type ModelJudgment,
    type NotebookCell,
    type Ob,
} from "catlog-wasm";

/** Detects a Petrinaut-exported JSON file. */
export function isFromPetrinaut(data: unknown): boolean {
    if (typeof data !== "object" || data === null) {
        return false;
    }
    const { meta } = data as Record<string, unknown>;
    if (typeof meta !== "object" || meta === null) {
        return false;
    }
    const { generator } = meta as Record<string, unknown>;
    return generator === "Petrinaut";
}

// Petrinaut schema fragment that we're interested in

type PetrinautArc = { placeId: string };

type PetrinautPlace = { id: string; name: string };

type PetrinautTransition = {
    id: string;
    name: string;
    inputArcs: PetrinautArc[];
    outputArcs: PetrinautArc[];
};

type PetrinautFile = {
    title: string;
    places: PetrinautPlace[];
    transitions: PetrinautTransition[];
};

function tensorOb(contentIds: string[]): Ob {
    return {
        tag: "App",
        content: {
            op: { tag: "Basic", content: "tensor" },
            ob: {
                tag: "List",
                content: {
                    modality: "SymmetricList",
                    objects: contentIds.map((id) => ({ tag: "Basic", content: id })),
                },
            },
        },
    };
}

/** Converts a Petrinaut-exported JSON file to a CatCoLab petri-net model document. */
export function convertFromPetrinaut(data: unknown): Document {
    const { title, places, transitions } = data as PetrinautFile;

    const placeIds = new Map<string, { cellId: string; contentId: string }>();
    for (const place of places) {
        placeIds.set(place.id, { cellId: v7(), contentId: v7() });
    }

    const cellOrder: string[] = [];
    const cellContents: Record<string, NotebookCell<ModelJudgment>> = {};

    for (const place of places) {
        const { cellId, contentId } = placeIds.get(place.id)!;
        cellOrder.push(cellId);
        cellContents[cellId] = {
            id: cellId,
            tag: "formal",
            content: {
                tag: "object",
                id: contentId,
                name: place.name,
                obType: { tag: "Basic" as const, content: "Object" },
            },
        };
    }

    for (const transition of transitions) {
        const cellId = v7();
        const contentId = v7();
        const domContentIds = transition.inputArcs.map(
            (arc) => placeIds.get(arc.placeId)!.contentId,
        );
        const codContentIds = transition.outputArcs.map(
            (arc) => placeIds.get(arc.placeId)!.contentId,
        );
        cellOrder.push(cellId);
        cellContents[cellId] = {
            id: cellId,
            tag: "formal",
            content: {
                tag: "morphism",
                id: contentId,
                name: transition.name,
                morType: {
                    tag: "Hom" as const,
                    content: { tag: "Basic" as const, content: "Object" },
                },
                dom: tensorOb(domContentIds),
                cod: tensorOb(codContentIds),
            },
        };
    }

    return {
        type: "model",
        theory: "petri-net",
        name: title,
        version: currentVersion(),
        notebook: { cellOrder, cellContents },
    };
}
