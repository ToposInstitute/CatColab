import TriangleAlert from "lucide-solid/icons/triangle-alert";
import type { JSX } from "solid-js";

import styles from "./warning_banner.module.css";

/** Props for a warning banner component. */
export type WarningBannerProps = {
    /** Main content of the banner. */
    children: JSX.Element;

    /** Optional actions (e.g., buttons) to display on the right side. */
    actions?: JSX.Element;
};

/** A warning banner component for displaying important warning messages with optional actions. */
export function WarningBanner(props: WarningBannerProps) {
    return (
        <div class={styles.warningBanner}>
            <div class={styles.warningBannerIcon}>
                <TriangleAlert size={20} />
            </div>
            <div class={styles.warningBannerContent}>
                <strong>Warning:</strong> {props.children}
            </div>
            {props.actions && <div class={styles.warningBannerActions}>{props.actions}</div>}
        </div>
    );
}
