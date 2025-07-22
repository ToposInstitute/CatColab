import type { RouteDefinition } from "@solidjs/router";
import { lazy } from "solid-js";

import { stdTheories } from "../stdlib";
import { lazyMdx } from "../util/mdx";
import { guidesList } from "./guides";

const theoryWithIdFilter = {
    id: (id: string) => stdTheories.has(id),
};

const existingGuideFilter = {
    id: (id: string) => guidesList.some((item) => item.id === id),
};

export const helpRoutes: RouteDefinition[] = [
    {
        path: "/",
        component: lazyMdx(() => import("./overview.mdx")),
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
        component: lazy(() => import("./logics_help_overview")),
    },
    {
        path: "/logics/:id",
        matchFilters: theoryWithIdFilter,
        component: lazy(() => import("./logic_help_detail")),
    },
];
