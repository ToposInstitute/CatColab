import { Binoculars, Bird, Github, NotebookPen } from "lucide-solid";
import { createSignal } from "solid-js";
import zulip_favicon from "./assets/zulip_favicon.png";
import "./walkthrough_overlay.css";

import { Dialog } from "../components";
import { Login } from "../user";

export function WalkthroughOverlay(props: { isOpen: boolean; onClose: () => void }) {
    const [loginOpen, setLoginOpen] = createSignal(false);

    const handleLoginComplete = () => {
        setLoginOpen(false);
        props.onClose();
    };

    return (
        <div
            class={`walkthrough-overlay ${props.isOpen ? "open" : ""}`}
            onClick={props.onClose}
            role="dialog"
            aria-labelledby="walkthrough-title"
            aria-modal="true"
        >
            <div class="walkthrough-content" onClick={(e) => e.stopPropagation()}>
                <div class="header-container">
                    <img
                        src="https://topos.institute/assets/logo-name.png"
                        alt="Topos Institute"
                        class="topos-logo"
                    />
                </div>

                <div class="step-content fade-in">
                    <h2>Welcome to CatColab!</h2>
                    <i>software for modeling the world, together</i>
                    <div class="resources-container">
                        <div class="resources-list">
                            <a
                                href="https://catcolab.org/help"
                                class="resource-link"
                                target="_blank"
                            >
                                <span class="resource-icon">
                                    <Bird />
                                </span>
                                <span>CatColab Overview</span>
                            </a>
                            <a
                                href="https://catcolab.org/help/quick-intro"
                                class="resource-link"
                                target="_blank"
                            >
                                <span class="resource-icon">
                                    <Binoculars />
                                </span>
                                <span>Example Models</span>
                            </a>
                            <a
                                href="https://topos.institute/blog/#category=CatColab"
                                class="resource-link"
                                target="_blank"
                            >
                                <span class="resource-icon">
                                    <NotebookPen />
                                </span>
                                <span>Blog Post</span>
                            </a>
                            <a
                                href="https://github.com/ToposInstitute/CatColab"
                                class="resource-link"
                                target="_blank"
                            >
                                <span class="resource-icon">
                                    <Github />
                                </span>
                                <span>Source Code</span>
                            </a>
                            <a href="" class="resource-link" target="_blank">
                                <span class="resource-icon">
                                    <img src={zulip_favicon} width="24" height="24" />
                                </span>
                                <span>Join us on Zulip!</span>
                            </a>
                        </div>
                    </div>
                </div>

                <div class="footer-container">
                    <div class="navigation-buttons">
                        <button class="nav-button get-started" onClick={() => setLoginOpen(true)}>
                            Login/Sign-Up
                        </button>
                        <button class="nav-button get-started" onClick={props.onClose}>
                            Get Started
                        </button>
                    </div>
                </div>
                <Dialog open={loginOpen()} onOpenChange={setLoginOpen} title="Log in">
                    <Login onComplete={handleLoginComplete} />
                </Dialog>
            </div>
        </div>
    );
}
