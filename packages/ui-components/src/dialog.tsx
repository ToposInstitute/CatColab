import { Close, Content, Label, Overlay, Portal, Root, Trigger } from "@corvu/dialog";
import X from "lucide-solid/icons/x";
import { type Component, type ComponentProps, type JSX, Show } from "solid-js";

import { IconButton } from "./icon_button";

import "./dialog.css";

/** A dialog overlaid on another window.

This component is a styled wrapper around corvu's `Dialog`.

The dialog is always controlled: `open` is required. Do *not* make it optional
and forward it with a conditional spread like `{...(open === undefined ? {} :
{ open })}`. Solid compiles a spread into `mergeProps`, whose proxy evaluates
the spread expression whenever *any* prop absent from the sibling static props
is read. corvu builds its whole context and children subtree inside a memo that
reads `contextId`, so such a spread makes that memo depend on `open`, and every
open/close disposes and recreates the dialog subtree instead of showing it.
 */
export function Dialog(props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: JSX.Element;
    title?: JSX.Element | undefined;
    trigger?: Component<ComponentProps<"button">> | undefined;
}) {
    return (
        <Root open={props.open} onOpenChange={props.onOpenChange} closeOnOutsideFocus={false}>
            <Show when={props.trigger}>{(trigger) => <Trigger as={trigger()} />}</Show>
            <Portal>
                <Overlay />
                <Content class="popup">
                    <div class="title-bar">
                        {props.title && <Label as="span">{props.title}</Label>}
                        <Close as={CloseButton} />
                    </div>
                    {props.children}
                </Content>
            </Portal>
        </Root>
    );
}

const CloseButton = (props: ComponentProps<"button">) => (
    <IconButton {...props} aria-label="Close">
        <X width={20} height={20} />
    </IconButton>
);
