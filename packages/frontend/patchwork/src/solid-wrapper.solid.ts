import { render } from "solid-js/web";
import { SolidComponent } from "./solid-component.solid";

export interface SolidWrapperProps {
    docUrl: string;
    name: string;
    theory: string;
    notebook: any;
    repo: any;
    api: any; // Context values passed as props
    theories: any; // Context values passed as props
}

export function renderSolidComponent(
    props: SolidWrapperProps,
    container: HTMLElement
): () => void {
    console.log("renderSolidComponent called with context props:", props);
    console.log("renderSolidComponent container:", container);

    console.log("=== Wrapper Level - Context Props ===");
    console.log("API prop:", props.api);
    console.log("Theories prop:", props.theories);

    try {
        console.log(
            "Attempting to render SolidJS component with context props..."
        );
        const dispose = render(() => SolidComponent(props), container);
        console.log("SolidJS render completed successfully");
        return dispose;
    } catch (error) {
        console.error("Error in renderSolidComponent:", error);
        throw error;
    }
}
