import Resizable from "@corvu/resizable";
import { createSignal } from "solid-js";

import "./resizable.css";

type ResizableHandleProps = Parameters<typeof Resizable.Handle>[0]["props"];

/** A styled wrapper for corvu's `Resizable.Handle`.
 */
export const ResizableHandle = (props: ResizableHandleProps) => {
    const [isResizing, setIsResizing] = createSignal(false);

    return (
        <Resizable.Handle
            classList={{
                "resizable-handle": true,
                active: isResizing(),
            }}
            onHandleDragStart={() => setIsResizing(true)}
            onHandleDragEnd={() => setIsResizing(false)}
            {...props}
        />
    );
};
