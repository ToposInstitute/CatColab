import { render } from "solid-js/web";
import CatColabHazelApp from "./CatColabHazelApp";

const root = document.getElementById("root");
if (root) {
    render(() => <CatColabHazelApp />, root);
}
