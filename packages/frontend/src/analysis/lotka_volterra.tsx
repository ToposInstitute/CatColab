import { createEffect, createMemo } from "solid-js";

import {
    type ColumnSchema,
    FixedTableEditor,
    Foldable,
    createNumericalColumn,
} from "../components";
import type { MorphismDecl, ObjectDecl } from "../model";
import type { ModelAnalysisMeta } from "../theory";
import type { LotkaVolterraContent, ModelAnalysisProps } from "./types";

import "./simulation.css";

/** Configure a Lotka-Volterra ODE analysis for use with models of a theory. */
export function configureLotkaVolterra(options?: {
    id?: string;
    name?: string;
    description?: string;
}): ModelAnalysisMeta<LotkaVolterraContent> {
    const {
        id = "lotka-volterra",
        name = "Lotka-Volterra dynamics",
        description = "Simulate the system using a Lotka-Volterra ODE",
    } = options ?? {};
    return {
        id,
        name,
        description,
        component: (props) => <LotkaVolterra title={name} {...props} />,
        initialContent: () => ({
            tag: "lotka-volterra",
            initialValues: {},
            growthRates: {},
            interactionCoefficients: {},
        }),
    };
}

/** Analyze a signed graph using Lotka-Volterra dynamics.
 */
export function LotkaVolterra(
    props: {
        title?: string;
    } & ModelAnalysisProps<LotkaVolterraContent>,
) {
    const obDecls = createMemo<ObjectDecl[]>(() => {
        return props.liveModel.formalJudgments().filter((jgmt) => jgmt.tag === "object");
    }, []);

    const morDecls = createMemo<MorphismDecl[]>(() => {
        return props.liveModel.formalJudgments().filter((jgmt) => jgmt.tag === "morphism");
    }, []);

    // Set default values of parameters whenever we get new objects/morphisms.
    // Q: Should we "garbage collect" parameters for deleted objects/morphisms?

    createEffect(() => {
        props.changeContent((content) => {
            for (const ob of obDecls()) {
                content.initialValues[ob.id] ??= 0;
                content.growthRates[ob.id] ??= 0;
            }
        });
    });

    createEffect(() => {
        props.changeContent((content) => {
            for (const mor of morDecls()) {
                content.interactionCoefficients[mor.id] ??= 1;
            }
        });
    });

    const obSchema: ColumnSchema<ObjectDecl>[] = [
        {
            header: true,
            content: (ob) => ob.name,
        },
        createNumericalColumn({
            name: "Initial value",
            data: (ob) => props.content.initialValues[ob.id],
            validate: (_, data) => data >= 0,
            setData: (ob, data) =>
                props.changeContent((content) => {
                    content.initialValues[ob.id] = data;
                }),
        }),
        createNumericalColumn({
            name: "Growth/decay",
            data: (ob) => props.content.growthRates[ob.id],
            setData: (ob, data) =>
                props.changeContent((content) => {
                    content.growthRates[ob.id] = data;
                }),
        }),
    ];

    const morSchema: ColumnSchema<MorphismDecl>[] = [
        {
            header: true,
            content: (mor) => mor.name,
        },
        createNumericalColumn({
            name: "Interaction",
            data: (mor) => props.content.interactionCoefficients[mor.id],
            validate: (_, data) => data >= 0,
            setData: (mor, data) =>
                props.changeContent((content) => {
                    content.interactionCoefficients[mor.id] = data;
                }),
        }),
    ];

    return (
        <div class="simulation">
            <Foldable header={<span class="title">{props.title}</span>}>
                <div class="parameters">
                    <FixedTableEditor rows={obDecls()} schema={obSchema} />
                    <FixedTableEditor rows={morDecls()} schema={morSchema} />
                </div>
            </Foldable>
        </div>
    );
}
