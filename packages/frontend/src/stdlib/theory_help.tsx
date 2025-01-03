import { useParams } from "@solidjs/router";
import { useContext } from "solid-js";
import invariant from "tiny-invariant";

import { TheoryHelp } from "../theory/help";
import { TheoryLibraryContext } from "./context";

/** Help page for a theory in the standard library. */
export default function TheoryHelpPage() {
    const theories = useContext(TheoryLibraryContext);
    invariant(theories, "Library of theories must be provided as context");

    const params = useParams();

    const theory = () => {
        invariant(params.id, "Theory ID must be provided as parameter");
        return theories.get(params.id);
    };

    return <TheoryHelp theory={theory()} />;
}
