import type { JSX } from "solid-js";

import { InlineInput, SettingsDisclosure } from "catcolab-ui-components";
import type { LiveDoc } from "../api";

import "../page/document_page.css";

/** Header for a document pane, with title, info, and optional settings.

Wraps the title and info row in a `SettingsDisclosure` so that, when a settings
pane is provided, the disclosure content appears below the header and pushes the
document content down.
 */
export function DocumentHead(props: {
    /** The live document (used for the title). */
    liveDoc: LiveDoc;
    /** Optional settings pane shown via a gear icon disclosure. */
    settingsPane?: JSX.Element;
    /** Size of the settings gear icon in pixels. */
    iconSize?: number;
    /** Info content rendered to the right of the title (e.g., theory selector). */
    children?: JSX.Element;
}) {
    return (
        <SettingsDisclosure settingsPane={props.settingsPane} iconSize={props.iconSize}>
            {(trigger) => (
                <div class="document-head">
                    <div class="title">
                        <InlineInput
                            text={props.liveDoc.doc.name}
                            setText={(text) => {
                                props.liveDoc.changeDoc((doc) => {
                                    doc.name = text;
                                });
                            }}
                            placeholder="Untitled"
                        />
                    </div>
                    <div class="info">
                        {props.children}
                        {trigger}
                    </div>
                </div>
            )}
        </SettingsDisclosure>
    );
}
