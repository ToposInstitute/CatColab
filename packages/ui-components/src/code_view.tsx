import "./code_view.css";

import { codeToHtml } from "shiki";
import { createResource } from "solid-js";

type CodeViewProps = CodeViewOptions & {
    text: string;
    language: string;
};

export type CodeViewOptions = CodeViewProps & {
    placeholder?: string;
};

export const CodeView = (props: CodeViewOptions) => {
  const [html] = createResource(() => codeToHtml(props.text, {
    lang: props.language,
    theme: 'min-light'
  }));

  return <div innerHTML={html()} />;
};
