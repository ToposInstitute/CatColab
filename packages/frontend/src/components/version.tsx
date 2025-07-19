import { APP_VERSION } from "../util/version";
import "./version.css";

export function Version() {
    return (
        <span class="version" title={`CatColab version ${APP_VERSION}`}>
            v {APP_VERSION}
        </span>
    );
}
