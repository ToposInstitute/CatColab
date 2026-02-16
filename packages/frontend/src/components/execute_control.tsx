import type { Signal } from "solid-js";

import { Button } from "catcolab-ui-components";

export function ExecuteGuard(props: {
    text: string;
    triggerText?: string;
    canTrigger: Signal<boolean>;
    shouldTrigger: Signal<boolean>;
}) {
    const [canTrigger, setCanTrigger] = props.canTrigger;
    const [_shouldTrigger, setShouldTrigger] = props.shouldTrigger;

    return (
        <div style="display: flex; align-items: center; justify-content: flex-end; gap: 4px;">
            <Button
                type="button"
                variant="utility"
                onClick={() => setShouldTrigger((val) => !val)}
                disabled={canTrigger()}
            >
                {props.text}
            </Button>
            <Button
                type="button"
                variant="utility"
                onClick={() => setCanTrigger((val) => !val)}
                disabled={false}
            >
                {`Turn ${canTrigger() ? "off" : "on"} ${props.triggerText ?? ""}`}
            </Button>
        </div>
    );
}
