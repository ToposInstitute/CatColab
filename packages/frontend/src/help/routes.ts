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
        path: "/credits",
        component: lazyMdx(() => import("./credits.mdx")),
    },
    {
        path: "/theories",
        component: lazy(() => import("./theories")),
    },
    {
        path: "/theory/:id",
        matchFilters: theoryWithIdFilter,
        component: lazy(() => import("./theory")),
    },
];
