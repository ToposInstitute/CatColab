import { createContext } from "solid-js";
import type { DeleteDocInfo } from "../components/delete_document_dialog";

/** Actions that can be performed from any page. */
export type PageActions = {
    /** Show a dialog to log-in or signup. */
    showLoginDialog: () => void;

    /** Show a dialog to import a document. */
    showImportDialog: () => void;

    /** Show a dialog to delete a document. */
    showDeleteDialog: (docInfo: DeleteDocInfo) => Promise<boolean>;
};

/** Context for actions performable on any page. */
export const PageActionsContext = createContext<PageActions>();
