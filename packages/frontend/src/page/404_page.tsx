import HelpContainer from "../help/help_container";

export default function NotFoundPage() {
    return (
        <HelpContainer children={NotFoundMessage}/>
    );
}

const NotFoundMessage = (
    <div>
        <h1>404</h1>
        <p>Sorry, we couldn't find this page.</p>
    </div>
);
