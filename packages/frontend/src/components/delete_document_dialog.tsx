import { Button } from "catcolab-ui-components";
import { createSignal } from "solid-js";
import { useApi } from "../api";
import { Dialog } from "./dialog";

export type DeleteDocumentInfo = {
    refId: string;
    name: string | null;
    typeName: string;
};

export function useDeleteDocument(docInfo: DeleteDocumentInfo) {
    const api = useApi();

    const [showDeleteConfirm, setShowDeleteConfirm] = createSignal(false);
    const [showError, setShowError] = createSignal(false);
    const [errorMessage, setErrorMessage] = createSignal("");
    const [resolveDeletion, setResolveDeletion] = createSignal<
        ((success: boolean) => void) | undefined
    >();

    const openDeleteDialog = () => {
        setShowDeleteConfirm(true);
        return new Promise<boolean>((resolve) => {
            setResolveDeletion(() => resolve);
        });
    };

    const handleConfirmDelete = async () => {
        setShowDeleteConfirm(false);

        try {
            const result = await api.rpc.delete_ref.mutate(docInfo.refId);
            if (result.tag === "Ok") {
                api.clearCachedDoc(docInfo.refId);
                resolveDeletion()?.(true);
                setResolveDeletion(undefined);
            } else {
                setErrorMessage(`Failed to delete document: ${result.message}`);
                setShowError(true);
                resolveDeletion()?.(false);
                setResolveDeletion(undefined);
            }
        } catch (error) {
            setErrorMessage(`Error deleting document: ${error}`);
            setShowError(true);
            resolveDeletion()?.(false);
            setResolveDeletion(undefined);
        }
    };

    const handleCancel = () => {
        setShowDeleteConfirm(false);
        resolveDeletion()?.(false);
        setResolveDeletion(undefined);
    };

    const docName = docInfo.name ? (
        docInfo.name.length > 40 ? (
            `${docInfo.name.slice(0, 40)}...`
        ) : (
            docInfo.name
        )
    ) : (
        <>
            this <em>untitled</em> {docInfo.typeName}
        </>
    );

    const DeleteDialogs = () => {
        return (
            <>
                <Dialog
                    open={showDeleteConfirm()}
                    onOpenChange={setShowDeleteConfirm}
                    title="Delete Document"
                >
                    <form onSubmit={(evt) => evt.preventDefault()}>
                        <p>Are you sure you want to delete {docName}?</p>
                        <div class="permissions-button-container">
                            <div class="permissions-spacer" />
                            <Button type="button" variant="utility" onClick={handleCancel}>
                                Cancel
                            </Button>
                            <Button type="button" variant="danger" onClick={handleConfirmDelete}>
                                Delete
                            </Button>
                        </div>
                    </form>
                </Dialog>

                <Dialog open={showError()} onOpenChange={setShowError} title="Error">
                    <form onSubmit={(evt) => evt.preventDefault()}>
                        <p>{errorMessage()}</p>
                        <div class="permissions-button-container">
                            <div class="permissions-spacer" />
                            <Button
                                type="button"
                                variant="primary"
                                onClick={() => setShowError(false)}
                            >
                                OK
                            </Button>
                        </div>
                    </form>
                </Dialog>
            </>
        );
    };

    return {
        openDeleteDialog,
        DeleteDialogs,
    };
}
