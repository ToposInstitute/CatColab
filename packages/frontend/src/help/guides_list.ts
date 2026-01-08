export type Guide = {
    id: string;
    title: string;
    description: string;
};

export const guidesList: Guide[] = [
    {
        id: "fundamentals",
        title: "Fundamentals of CatColab",
        description:
            'What do we mean by "formal, interoperable, conceptual modeling", and how does CatColab implement this?',
    },
    {
        id: "example-models",
        title: "Ready-made models",
        description:
            "Some ready-made models in various logics, of various complexity, and from various domains",
    },
];
