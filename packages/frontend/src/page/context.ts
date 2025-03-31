import { createContext } from "solid-js";

/** Actions that can be performed from any page. */
export type PageActions = {
    /** Show a dialog to log-in or signup. */
    showLoginDialog: () => void;

    /** Show a dialog to import a document. */
    showImportDialog: () => void;
};

/** Context for actions performable on any page. */
export const PageActionsContext = createContext<PageActions>();
