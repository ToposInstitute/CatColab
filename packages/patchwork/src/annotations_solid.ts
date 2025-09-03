import type { AutomergeUrl } from "@automerge/automerge-repo";
import type {
    Annotation,
    AnnotationWithUIState,
    Comment,
    Pointer,
    useAllAnnotations,
} from "@patchwork/sdk/annotations";
import { Accessor, createContext, useContext } from "solid-js";

export type DocUrlWithAnnotations = {
    originalUrl: AutomergeUrl;
    cloneUrl: AutomergeUrl;
    annotations: Annotation[];
};

export const AnnotationsContext = createContext<Accessor<ReturnType<typeof useAllAnnotations>>>();

export const useAnnotationsOfDoc = <D, T, V>(
    docUrl: AutomergeUrl,
): {
    annotations: Accessor<AnnotationWithUIState<D, T, V>[]>;
    selection: Accessor<Pointer<D, T, V>[]>;
    setSelection: (pointers: Pointer<D, T, V>[]) => void;
    addComment: (pointers: Pointer<D, T, V>[]) => Promise<Comment>;
} => {
    const context = useContext(AnnotationsContext);
    if (!context) {
        throw new Error("AnnotationsContext not found");
    }

    const annotations = () => {
        return (context().docLinksWithAnnotations.find(
            (docLinkWithAnnotations) =>
                docLinkWithAnnotations.url === docUrl ||
                docLinkWithAnnotations.main?.url === docUrl,
        )?.annotations ?? []) as AnnotationWithUIState<D, T, V>[];
    };

    return {
        annotations,
        setSelection: (pointers: Pointer<D, T, V>[]) => {
            context().setSelection(pointers.map((pointer) => ({ ...pointer, docUrl })));
        },
        selection: () => {
            return context()
                .selection.filter((pointer) => pointer.docUrl === docUrl)
                .map((pointer) => {
                    const { docUrl, ...rest } = pointer;
                    return rest as Pointer<D, T, V>;
                });
        },
        addComment: (pointers: Pointer<D, T, V>[]): Promise<Comment> => {
            return context().addComment(pointers.map((pointer) => ({ ...pointer, docUrl })));
        },
    };
};
