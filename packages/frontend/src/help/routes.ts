import type { RouteDefinition } from "@solidjs/router";
import { lazy } from "solid-js";

import { stdTheories } from "../stdlib";
import { lazyMdx } from "../util/mdx";
import { guidesList } from "./guides";

const theoryWithIdFilter = {
    id: (id: string) => stdTheories.has(id),
};

const existingGuideFilter = {
    // TIM-TO-DO: is there a slicker/more idiomatic way of doing this?
    id: (id: string) => guidesList.find((item) => item.id === id) !== undefined,
};

export const helpRoutes: RouteDefinition[] = [
    {
        path: "/",
        component: lazyMdx(() => import("./index.mdx")),
    },
    {
        path: "/analyses",
        component: lazy(() => import("./analyses")),
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
        path: "/guides",
        component: lazy(() => import("./guides")),
    },
    {
        path: "/guides/:id",
        matchFilters: existingGuideFilter,
        component: lazy(() => import("./guide")),
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
];
