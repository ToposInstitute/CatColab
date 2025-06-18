import { render } from "solid-js/web";
import { SolidComponent } from "./solid-component.solid";

export interface SolidWrapperProps {
    docUrl: string;
    name: string;
    theory: string;
    notebook: any;
    repo: any;
}

export function renderSolidComponent(
    props: SolidWrapperProps,
    container: HTMLElement
): () => void {
    console.log("renderSolidComponent called with props:", props);
    console.log("renderSolidComponent container:", container);
    console.log("SolidComponent type:", typeof SolidComponent);

    try {
        console.log("Attempting to render SolidJS component...");
        const dispose = render(() => {
            console.log("SolidJS render function called");
            try {
                const component = SolidComponent(props);
                console.log("SolidComponent created successfully:", component);
                return component;
            } catch (error) {
                console.error("Error in SolidComponent creation:", error);
                throw error;
            }
        }, container);
        console.log("SolidJS render completed successfully");
        return dispose;
    } catch (error) {
        console.error("Error in renderSolidComponent:", error);
        throw error;
    }
}
