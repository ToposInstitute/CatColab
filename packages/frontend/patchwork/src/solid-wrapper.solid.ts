import { render } from "solid-js/web";
import { SolidComponent } from "./solid-component.solid";

export interface SolidWrapperProps {
  docUrl: string;
  message: string;
}

export function renderSolidComponent(
  props: SolidWrapperProps,
  container: HTMLElement
): () => void {
  return render(() => SolidComponent(props), container);
}
