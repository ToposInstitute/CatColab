import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { Button } from "./button";
import { KatexDisplay } from "./katex_display";

const meta: Meta<typeof KatexDisplay> = {
    title: "Misc/KatexDisplay",
    component: KatexDisplay,
    tags: ["autodocs"],
    argTypes: {
        math: {
            control: "text",
            description: "The LaTeX math expression to render",
        },
    },
};

export default meta;
type Story = StoryObj<typeof KatexDisplay>;

export const InlineMode: Story = {
    args: {
        math: "c = \\pm\\sqrt{a^2 + b^2}",
    },
};

export const QuadraticFormula: Story = {
    args: {
        math: "x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}",
    },
};

export const Matrix: Story = {
    args: {
        math: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}",
    },
};

export const Summation: Story = {
    args: {
        math: "\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}",
    },
};

export const Integral: Story = {
    args: {
        math: "\\int_{a}^{b} f(x)\\,dx",
    },
};

export const ErrorHandling: Story = {
    args: {
        math: "\\invalid{syntax}",
    },
};

export const ComplexExpression: Story = {
    args: {
        math: "f(x) = \\int_{-\\infty}^{\\infty} \\hat{f}(\\xi) e^{2\\pi i \\xi x} \\, d\\xi",
    },
};

export const Reactive: Story = {
    render: () => {
        const equations = [
            "c = \\pm\\sqrt{a^2 + b^2}",
            "x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}",
            "\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}",
            "\\int_{a}^{b} f(x)\\,dx",
            "e^{i\\pi} + 1 = 0",
        ];
        const [currentIndex, setCurrentIndex] = createSignal(0);
        const [math, setMath] = createSignal(equations[0]);

        const nextEquation = () => {
            const nextIndex = (currentIndex() + 1) % equations.length;
            setCurrentIndex(nextIndex);
            setMath(equations[nextIndex]);
        };

        return (
            <div style={{ display: "flex", "flex-direction": "column", gap: "1rem" }}>
                <Button onClick={nextEquation}>
                    Next Equation ({currentIndex() + 1}/{equations.length})
                </Button>
                <KatexDisplay math={math()} />
            </div>
        );
    },
};
