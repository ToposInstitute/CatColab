import type { RouteDefinition } from "@solidjs/router";
import { lazy } from "solid-js";

import { stdTheories } from "../stdlib";
import { lazyMdx } from "../util/mdx";

const theoryWithIdFilter = {
    id: (id: string) => stdTheories.has(id),
};

export const helpRoutes: RouteDefinition[] = [
    {
        path: "/",
        component: lazyMdx(() => import("./index.mdx")),
    },
    {
        path: "/concepts",
        component: lazyMdx(() => import("./concepts.mdx")),
    },
    {
        path: "/credits",
        component: lazyMdx(() => import("./credits.mdx")),
    },
    {
        path: "/logics",
        component: lazy(() => import("./logics")),
    },
    {
        path: "/logics/:id",
        matchFilters: theoryWithIdFilter,
        component: lazy(() => import("./logic")),
    },
    {
        path: "/quick-intro",
        component: lazyMdx(() => import("./quick_intro.mdx")),
    },
];
