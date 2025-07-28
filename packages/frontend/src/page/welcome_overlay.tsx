import { Match, Switch, createSignal } from "solid-js";

import { Login } from "../user";

import Binoculars from "lucide-solid/icons/binoculars";
import Bird from "lucide-solid/icons/bird";
import Github from "lucide-solid/icons/github";
import NotebookPen from "lucide-solid/icons/notebook-pen";
import zulip_favicon from "./assets/zulip_favicon.png";

import "./welcome_overlay.css";

export function WelcomeOverlay(props: { isOpen: boolean; onClose: () => void }) {
    const [loginOpen, setLoginOpen] = createSignal(false);

    const handleLoginComplete = () => {
        setLoginOpen(false);
        props.onClose();
    };

    return (
        <div
            class={`welcome-overlay ${props.isOpen ? "open" : ""}`}
            onClick={props.onClose}
            role="dialog"
            aria-labelledby="welcome-title"
            aria-modal="true"
        >
            <div class="welcome-content" onClick={(e) => e.stopPropagation()}>
                <div class="welcome-header-container">
                    <img
                        src="https://topos.institute/assets/logo-name.png"
                        alt="Topos Institute"
                        class="topos-logo"
                    />
                </div>
                <Switch>
                    <Match when={loginOpen()}>
                        <div class="welcome-body fade-in">
                            <Login onComplete={handleLoginComplete} />
                            <div class="welcome-navigation-buttons left">
                                <button
                                    class="welcome-nav-button"
                                    onClick={() => setLoginOpen(false)}
                                >
                                    Go back
                                </button>
                            </div>
                        </div>
                    </Match>
                    <Match when={!loginOpen()}>
                        <div class="welcome-body fade-in">
                            <h2>Welcome to CatColab!</h2>
                            <i>software for modeling the world, together</i>
                            <div class="resources-container">
                                <div class="resources-list">
                                    <a
                                        href="https://topos.institute/blog/#category=CatColab"
                                        class="resource-link"
                                        target="_blank"
                                    >
                                        <span class="resource-icon">
                                            <Bird />
                                        </span>
                                        <span>CatColab blog posts</span>
                                    </a>
                                    <a
                                        href="/help/guides/example-models"
                                        class="resource-link"
                                        target="_blank"
                                    >
                                        <span class="resource-icon">
                                            <Binoculars />
                                        </span>
                                        <span>Example models</span>
                                    </a>
                                    <a href="/help/" class="resource-link" target="_blank">
                                        <span class="resource-icon">
                                            <NotebookPen />
                                        </span>
                                        <span>Help pages</span>
                                    </a>
                                    <a
                                        href="https://github.com/ToposInstitute/CatColab"
                                        class="resource-link"
                                        target="_blank"
                                    >
                                        <span class="resource-icon">
                                            <Github />
                                        </span>
                                        <span>Source code</span>
                                    </a>
                                    <a
                                        href="https://catcolab.zulipchat.com/"
                                        class="resource-link"
                                        target="_blank"
                                    >
                                        <span class="resource-icon">
                                            <img src={zulip_favicon} width="24" height="24" />
                                        </span>
                                        <span>Zulip chatroom</span>
                                    </a>
                                </div>
                            </div>
                        </div>
                        <div class="welcome-footer-container">
                            <div class="welcome-navigation-buttons">
                                <button
                                    class="welcome-nav-button get-started"
                                    onClick={() => setLoginOpen(true)}
                                >
                                    Login/Sign-Up
                                </button>
                                <button
                                    class="welcome-nav-button get-started"
                                    onClick={props.onClose}
                                >
                                    Get Started
                                </button>
                            </div>
                        </div>
                    </Match>
                </Switch>
            </div>
        </div>
    );
}
