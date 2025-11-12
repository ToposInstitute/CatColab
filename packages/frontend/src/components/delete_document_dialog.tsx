import { Button, Dialog } from "catcolab-ui-components";
import { createSignal } from "solid-js";
import { useApi } from "../api";

export type DeleteDocInfo = {
    refId: string;
    name: string | null;
    typeName: string;
};

export function useDeleteDocument() {
    const api = useApi();

    const [showDeleteConfirm, setShowDeleteConfirm] = createSignal(false);
    const [showError, setShowError] = createSignal(false);
    const [errorMessage, setErrorMessage] = createSignal("");
    const [currentDocInfo, setCurrentDocInfo] = createSignal<DeleteDocInfo | null>(null);
    const [resolveDeletion, setResolveDeletion] = createSignal<
        ((success: boolean) => void) | undefined
    >();

    const openDeleteDialog = (docInfo: DeleteDocInfo) => {
        setCurrentDocInfo(docInfo);
        setShowDeleteConfirm(true);
        return new Promise<boolean>((resolve) => {
            setResolveDeletion(() => resolve);
        });
    };

    const handleConfirmDelete = async () => {
        setShowDeleteConfirm(false);
        const info = currentDocInfo();
        if (!info) {
            return;
        }

        try {
            const result = await api.rpc.delete_ref.mutate(info.refId);
            if (result.tag === "Ok") {
                api.clearCachedDoc(info.refId);
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

    const docName = () => {
        const info = currentDocInfo();
        if (!info) {
            return "";
        }
        return info.name ? (
            info.name.length > 40 ? (
                `${info.name.slice(0, 40)}...`
            ) : (
                info.name
            )
        ) : (
            <>
                this <em>untitled</em> {info.typeName}
            </>
        );
    };

    const DeleteDialogs = () => {
        return (
            <>
                <Dialog
                    open={showDeleteConfirm()}
                    onOpenChange={setShowDeleteConfirm}
                    title="Delete Document"
                >
                    <form onSubmit={(evt) => evt.preventDefault()}>
                        <p>Are you sure you want to delete {docName()}?</p>
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
