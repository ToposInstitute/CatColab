import { ErrorBoundary, type JSX, createSignal } from "solid-js";

import { Dialog } from "../components";
import { Login } from "../user";
import { ErrorBoundaryPage } from "../util/errors";
import { type PageActions, PageActionsContext } from "./context";
import { ImportDocument } from "./import_document";

/** Container for any page in the application.

For now, this serves to anchor dialogs at a high level in the component
hierarchy. If you naively create them in the menu bar items that show the
dialogs, the dialogs will be unmounted when the menu is.
 */
export function PageContainer(props: {
    children?: JSX.Element;
}) {
    const [loginOpen, setLoginOpen] = createSignal(false);
    const [openImport, setImportOpen] = createSignal(false);

    const actions: PageActions = {
        showLoginDialog: () => setLoginOpen(true),
        showImportDialog: () => setImportOpen(true),
    };

    return (
        <>
            <PageActionsContext.Provider value={actions}>
                <ErrorBoundary fallback={(err) => <ErrorBoundaryPage error={err} />}>
                    {props.children}
                </ErrorBoundary>
            </PageActionsContext.Provider>
            <Dialog open={loginOpen()} onOpenChange={setLoginOpen} title="Log in">
                <Login onComplete={() => setLoginOpen(false)} />
            </Dialog>
            <Dialog open={openImport()} onOpenChange={setImportOpen} title="Import">
                <ImportDocument onComplete={() => setImportOpen(false)} />
            </Dialog>
        </>
    );
}
