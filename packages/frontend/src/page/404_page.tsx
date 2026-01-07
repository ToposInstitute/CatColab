import { Title } from "@solidjs/meta";

import HelpContainer from "../help/help_layout";

export default function NotFoundPage() {
    const appTitle = import.meta.env.VITE_APP_TITLE;

    return (
        <>
            <Title>404 Not Found - {appTitle}</Title>
            <HelpContainer>
                <h1>404</h1>
                <p>Sorry, we couldn't find this page.</p>
            </HelpContainer>
        </>
    );
}
