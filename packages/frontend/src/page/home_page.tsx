import { useNavigate } from "@solidjs/router";
import { getAuth } from "firebase/auth";
import Binoculars from "lucide-solid/icons/binoculars";
import Bird from "lucide-solid/icons/bird";
import ExternalLink from "lucide-solid/icons/external-link";
import FilePlus from "lucide-solid/icons/file-plus";
import Files from "lucide-solid/icons/files";
import Github from "lucide-solid/icons/github";
import LogInIcon from "lucide-solid/icons/log-in";
import NotebookPen from "lucide-solid/icons/notebook-pen";
import { useAuth, useFirebaseApp } from "solid-firebase";
import { createSignal, Match, Show, Switch } from "solid-js";
import { useApi } from "../api";
import { createModel } from "../model/document";
import { stdTheories } from "../stdlib";
import { Login } from "../user";
import { BrandedToolbar } from "./toolbar";

import "./home_page.css";

export default function HomePage() {
    const [loginOpen, setLoginOpen] = createSignal(false);
    const [creating, setCreating] = createSignal(false);
    const navigate = useNavigate();
    const api = useApi();

    const firebaseApp = useFirebaseApp();
    const auth = useAuth(getAuth(firebaseApp));

    const isLoggedIn = () => auth?.data != null;
    const isAuthLoading = () => auth.loading;

    const handleLoginComplete = () => {
        setLoginOpen(false);
    };

    const handleCreateModel = async () => {
        setCreating(true);
        try {
            const ref = await createModel(api, stdTheories.defaultTheoryMetadata().id);
            navigate(`/model/${ref}`);
        } catch (error) {
            console.error("Failed to create model:", error);
        } finally {
            setCreating(false);
        }
    };

    return (
        <div class="home-page">
            <BrandedToolbar />
            <div class="page-container">
                <div class="home-content">
                    <Switch>
                        <Match when={loginOpen()}>
                            <div class="home-body fade-in">
                                <Login onComplete={handleLoginComplete} />
                                <div class="home-navigation-buttons left">
                                    <button
                                        class="home-nav-button"
                                        onClick={() => setLoginOpen(false)}
                                    >
                                        Go back
                                    </button>
                                </div>
                            </div>
                        </Match>
                        <Match when={!loginOpen()}>
                            <div class="home-body fade-in">
                                <div class="welcome-intro">
                                    <h2>Welcome to CatColab!</h2>
                                    <i>software for modeling the world, together</i>
                                </div>
                                <div class="quick-actions">
                                    <Show when={!isAuthLoading() && !isLoggedIn()}>
                                        <button
                                            class="home-nav-button get-started"
                                            onClick={() => setLoginOpen(true)}
                                        >
                                            <LogInIcon />
                                            <span>Log in or sign up</span>
                                        </button>
                                    </Show>
                                    <Show when={!isAuthLoading() && isLoggedIn()}>
                                        <a href="/documents" class="home-nav-button outline">
                                            <Files />
                                            <span>My documents</span>
                                        </a>
                                    </Show>
                                    <button
                                        class="home-nav-button get-started"
                                        onClick={handleCreateModel}
                                        disabled={creating()}
                                    >
                                        <FilePlus />
                                        <span>{creating() ? "Creating..." : "New model"}</span>
                                    </button>
                                </div>
                                <div class="resources-container">
                                    <div class="resources-list">
                                        <a href="/help/" class="resource-link">
                                            <span class="resource-icon">
                                                <NotebookPen />
                                            </span>
                                            <span>Help pages</span>
                                        </a>
                                        <a href="/help/guides/example-models" class="resource-link">
                                            <span class="resource-icon">
                                                <Binoculars />
                                            </span>
                                            <span>Example models</span>
                                        </a>
                                        <a
                                            href="https://topos.institute/blog/#category=CatColab"
                                            class="resource-link"
                                            target="_blank"
                                            rel="noopener"
                                        >
                                            <span class="resource-icon">
                                                <Bird />
                                            </span>
                                            <span>CatColab blog posts</span>
                                            <span class="external-link-icon">
                                                <ExternalLink />
                                            </span>
                                        </a>
                                        <a
                                            href="https://github.com/ToposInstitute/CatColab"
                                            class="resource-link"
                                            target="_blank"
                                            rel="noopener"
                                        >
                                            <span class="resource-icon">
                                                <Github />
                                            </span>
                                            <span>Source code</span>
                                            <span class="external-link-icon">
                                                <ExternalLink />
                                            </span>
                                        </a>
                                        <a
                                            href="https://catcolab.zulipchat.com/"
                                            class="resource-link"
                                            target="_blank"
                                            rel="noopener"
                                        >
                                            <span class="resource-icon">
                                                <img src="/zulip_icon.png" width="24" height="24" />
                                            </span>
                                            <span>Zulip chatroom</span>
                                            <span class="external-link-icon">
                                                <ExternalLink />
                                            </span>
                                        </a>
                                    </div>
                                </div>
                                <div class="logo-section">
                                    <a
                                        href="https://topos.institute"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        <img
                                            src="https://topos.institute/assets/logo-name.png"
                                            alt="Topos Institute"
                                            class="bottom-topos-logo"
                                        />
                                    </a>
                                </div>
                            </div>
                        </Match>
                    </Switch>
                </div>
            </div>
        </div>
    );
}
