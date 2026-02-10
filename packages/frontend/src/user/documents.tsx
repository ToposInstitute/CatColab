import { Title } from "@solidjs/meta";
import { getAuth } from "firebase/auth";
import { useFirebaseApp } from "solid-firebase";
import {
    createEffect,
    createResource,
    createSignal,
    For,
    Match,
    onMount,
    Switch,
    useContext,
} from "solid-js";

import type { RefStub } from "catcolab-api";
import { rpcResourceErr, rpcResourceOk, useApi } from "../api";
import { BrandedToolbar, PageActionsContext } from "../page";
import { LoginGate } from "./login";
import "./documents.css";

import { useNavigate } from "@solidjs/router";
import X from "lucide-solid/icons/x";
import invariant from "tiny-invariant";

import { IconButton, Spinner } from "catcolab-ui-components";

export default function UserDocuments() {
    const appTitle = import.meta.env.VITE_APP_TITLE;

    return (
        <>
            <Title>My Documents - {appTitle}</Title>
            <div class="documents-page">
                <BrandedToolbar />
                <div class="page-container">
                    <LoginGate>
                        <DocumentsSearch />
                    </LoginGate>
                </div>
            </div>
        </>
    );
}

function DocumentsSearch() {
    return <></>;
}
