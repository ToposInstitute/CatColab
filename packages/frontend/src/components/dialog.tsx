import { Close, Content, Label, Overlay, Portal, Root, Trigger } from "@corvu/dialog";
import X from "lucide-solid/icons/x";
import type { Component, ComponentProps, JSX } from "solid-js";

import { IconButton } from "../components";

import "./dialog.css";

/** A dialog overlaid on another window.

This component is a styled wrapper around corvu's `Dialog`.
 */
export function Dialog(props: {
    children: JSX.Element;
    title?: JSX.Element | "string";
    trigger?: Component<ComponentProps<"button">>;
}) {
    return (
        <Root>
            <Trigger as={props.trigger} />
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
    <IconButton {...props}>
        <X width={20} height={20} />
    </IconButton>
);
