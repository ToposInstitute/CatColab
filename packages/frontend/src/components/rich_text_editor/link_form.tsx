import { createSignal, JSX } from "solid-js";

export default function LinkForm({
    onUrlChosen,
}: { onUrlChosen: (url: string) => void }): JSX.Element {
    const [linkUrl, setLinkUrl] = createSignal("");

    const onFormSubmit = (e: Event) => {
        e.preventDefault();
        onUrlChosen(linkUrl());
    };

    return (
        <form onSubmit={onFormSubmit}>
            <input
                type="text"
                value={linkUrl()}
                onInput={(e) => setLinkUrl((e.currentTarget as HTMLInputElement).value)}
            />
            <button type="submit">Insert</button>
        </form>
    );
}
