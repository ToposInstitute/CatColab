import { BrandedToolbar } from "./toolbar";

export default function NotFoundPage() {
    return (
        <div class="growable-container">
            <BrandedToolbar />
            <div class="help-container">
                <h1>404</h1>
                <h4>{"Sorry, we couldn't find this page."}</h4>
            </div>
        </div>
    );
}
