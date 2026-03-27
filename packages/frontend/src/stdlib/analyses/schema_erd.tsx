import type * as Viz from "@viz-js/viz";
import { escape as escapeHtml } from "html-escaper";
import download from "js-file-download";
import Download from "lucide-solid/icons/download";
import { createResource, Show } from "solid-js";

import { BlockTitle, FormGroup, IconButton, SelectField } from "catcolab-ui-components";
import type { DblModel, MorType, Ob, ObType } from "catlog-wasm";
import type { ModelAnalysisProps } from "../../analysis";
import { loadViz } from "../../visualization";
import { Direction, type SchemaERDConfig } from "./schema_erd_config";

/** Types that the ERD should query from the model. */
export type SchemaERDTypes = {
    entityType: ObType;
    attrTypes: MorType[];
    nullableAttrTypes: MorType[];
    relationTypes: MorType[];
    nullableRelationTypes: MorType[];
};

/** Visualize a schema as an Entity-Relationship Diagram.

This visualization is specifically designed for schemas (models of the simple-schema
theory) and displays entities as tables with their attributes listed inside.
*/
export default function SchemaERD(
    props: ModelAnalysisProps<SchemaERDConfig> & { types: SchemaERDTypes },
) {
    const graph = () => {
        const model = props.liveModel.elaboratedModel();
        if (model) {
            return schemaToERD(model, props.types);
        }
    };

    const [vizResource] = createResource(loadViz);

    const svgString = () => {
        const viz = vizResource();
        const g = graph();
        if (!viz || !g) {
            return undefined;
        }

        const direction = props.content.direction ?? Direction.Vertical;
        return viz.renderString(g, {
            format: "svg",
            graphAttributes: {
                rankdir: direction === Direction.Horizontal ? "LR" : "TB",
            },
        });
    };

    const schemaName = () => props.liveModel.liveDoc.doc.name || "Untitled";
    const header = () => (
        <>
            <IconButton
                onClick={() => {
                    const svg = svgString();
                    if (svg) {
                        download(svg, `${schemaName()} - ERD.svg`, "image/svg+xml");
                    }
                }}
                disabled={!svgString()}
                tooltip={`Export the entity-relationship diagram as SVG`}
            >
                <Download size={16} />
            </IconButton>
        </>
    );

    return (
        <div class="graph-visualization-container">
            <BlockTitle
                title="Entity-relationship diagram"
                actions={header()}
                settingsPane={
                    <FormGroup compact>
                        <SelectField
                            label="Direction"
                            value={props.content.direction ?? Direction.Vertical}
                            onChange={(evt) => {
                                props.changeContent((content) => {
                                    content.direction = evt.currentTarget.value as Direction;
                                });
                            }}
                        >
                            <option value={Direction.Horizontal}>{"Horizontal"}</option>
                            <option value={Direction.Vertical}>{"Vertical"}</option>
                        </SelectField>
                    </FormGroup>
                }
            />
            <div class="graph-visualization">
                {/* oxlint-disable-next-line solid/no-innerhtml -- SVG from trusted Graphviz output */}
                <Show when={svgString()}>{(svg) => <div innerHTML={svg()} />}</Show>
            </div>
        </div>
    );
}

/** Unwrap a Maybe-wrapped ob to get the inner ob. */
function unwrapOb(ob: Ob): Ob {
    if (ob.tag === "Maybe") {
        return unwrapOb(ob.content);
    }
    return ob;
}

/** Convert a schema model into an ERD-style Graphviz graph using HTML-like labels. */
export function schemaToERD(model: DblModel, types: SchemaERDTypes): Viz.Graph {
    const entities = model.obGeneratorsWithType(types.entityType);
    const nodes: Required<Viz.Graph>["nodes"] = [];

    const nullableAttrSet = new Set(types.nullableAttrTypes.map((t) => JSON.stringify(t)));
    const nullableRelSet = new Set(types.nullableRelationTypes.map((t) => JSON.stringify(t)));

    // Collect all mappings to know which entities they point to
    const mappingsByEntity = new Map<
        string,
        Array<{ id: string; name: string; targetEntity: string; nullable: boolean }>
    >();
    for (const relType of [...types.relationTypes, ...types.nullableRelationTypes]) {
        const nullable = nullableRelSet.has(JSON.stringify(relType));
        for (const morId of model.morGeneratorsWithType(relType)) {
            const mor = model.morPresentation(morId);
            const dom = mor?.dom ? unwrapOb(mor.dom) : undefined;
            const cod = mor?.cod ? unwrapOb(mor.cod) : undefined;
            if (
                mor &&
                dom?.tag === "Basic" &&
                cod?.tag === "Basic" &&
                entities.includes(dom.content) &&
                entities.includes(cod.content)
            ) {
                const mappingName = mor.label?.join(".") ?? "";
                const sourceEntity = dom.content;
                const targetEntity = cod.content;

                if (!mappingsByEntity.has(sourceEntity)) {
                    mappingsByEntity.set(sourceEntity, []);
                }
                mappingsByEntity.get(sourceEntity)?.push({
                    id: morId,
                    name: mappingName,
                    targetEntity,
                    nullable,
                });
            }
        }
    }

    // Build entity tables
    for (const entityId of entities) {
        const entity = model.obPresentation(entityId);

        const attributes: Array<{ name: string; type: string; nullable: boolean }> = [];
        for (const attrType of [...types.attrTypes, ...types.nullableAttrTypes]) {
            const nullable = nullableAttrSet.has(JSON.stringify(attrType));
            for (const morId of model.morGeneratorsWithType(attrType)) {
                const mor = model.morPresentation(morId);
                const dom = mor?.dom ? unwrapOb(mor.dom) : undefined;
                const cod = mor?.cod ? unwrapOb(mor.cod) : undefined;
                if (mor && dom?.tag === "Basic" && cod?.tag === "Basic") {
                    if (dom.content === entityId) {
                        const attrName = mor.label?.join(".") ?? "";
                        const attrTypeOb = model.obPresentation(cod.content);
                        const attrTypeName = attrTypeOb?.label?.join(".") ?? "";
                        attributes.push({ name: attrName, type: attrTypeName, nullable });
                    }
                }
            }
        }
        const mappings = mappingsByEntity.get(entityId) ?? [];

        const entityLabel = escapeHtml(entity.label?.join(".") ?? "");
        const paddingLeft = computePaddingCenteredLeft(entityLabel);
        const paddingRight = computePaddingCenteredRight(entityLabel);
        // We cannot use our global CSS custom properties for this color
        const bgColor = "#a6f2f2";
        let tableRows = `
            <tr>
                <td port="${entityId}" bgcolor="${bgColor}" align="center" colspan="2"><b><font point-size="12">${paddingLeft}${entityLabel}${paddingRight}</font></b></td>
            </tr>
        `;

        if (attributes.length === 0 && mappings.length === 0) {
            tableRows += `
                <tr>
                    <td align="left" colspan="2"><font point-size="12"><i>(no attributes)</i>&#160;&#160;</font></td>
                </tr>
            `;
        } else {
            for (const attr of attributes) {
                const name = escapeHtml(attr.name);
                const nullableSuffix = attr.nullable ? "?" : "";
                const label = escapeHtml(attr.type) + nullableSuffix;
                const paddingName = computePadding(name);
                const paddingLabel = computePadding(label);
                tableRows += `
                    <tr>
                        <td align="left"><font point-size="12">${name}${paddingName}</font></td>
                        <td align="left"><font point-size="12">${label}${paddingLabel}</font></td>
                    </tr>
                `;
            }
            for (const mapping of mappings) {
                let label =
                    model.obPresentation(mapping.targetEntity).label?.join(".") ||
                    mapping.targetEntity;
                label = escapeHtml(label);
                label = `→ ${label}${mapping.nullable ? "?" : ""}`;
                const paddingLabel = computePadding(label);
                const name = escapeHtml(mapping.name);
                const paddingName = computePadding(name);
                tableRows += `
                    <tr>
                        <td align="left" port="${escapeHtml(mapping.id)}"><font point-size="12">${name}${paddingName}</font></td>
                        <td align="left"><font point-size="12">${label}${paddingLabel}</font></td>
                    </tr>
                `;
            }
        }

        nodes.push({
            name: entityId,
            attributes: {
                id: entityId,
                label: {
                    html: `
                        <table border="0" cellborder="1" cellspacing="0" cellpadding="4">
                            ${tableRows}
                        </table>
                    `,
                },
            },
        });
    }

    // Add edges for entity-to-entity mappings (foreign keys) using ports
    const edges: Required<Viz.Graph>["edges"] = [];
    for (const [sourceEntity, mappings] of mappingsByEntity) {
        for (const mapping of mappings) {
            edges.push({
                tail: sourceEntity,
                head: mapping.targetEntity,
                attributes: {
                    id: mapping.id,
                    tailport: `${mapping.id}:w`,
                    arrowhead: "none",
                    arrowtail: mapping.nullable ? "crowodot" : "crow",
                    dir: "both",
                    style: "solid",
                },
            });
        }
    }

    return {
        directed: true,
        nodes,
        edges,
        graphAttributes: {
            rankdir: "TB",
            bgcolor: "transparent",
        },
        nodeAttributes: {
            fontname: "sans-serif",
            fontsize: "10",
            shape: "plaintext",
        },
        edgeAttributes: {
            fontname: "sans-serif",
            fontsize: "9",
            color: "#666666",
        },
    };
}

// These padding functions are a hack to get the Graphviz HTML-like table layout to contain our text properly
function computePadding(text: string): string {
    const width = text.length;
    const padding = Math.ceil(width / 6 + Math.sqrt(width));

    return Array(padding).fill("&#160;").join("");
}

function computePaddingCenteredRight(text: string): string {
    const width = text.length;
    const padding = Math.ceil(width / 3);

    return Array(padding).fill("&#160;").join("");
}

function computePaddingCenteredLeft(text: string): string {
    const width = text.length;
    const padding = Math.ceil(width / 3 + Math.sqrt(width));

    return Array(padding).fill("&#160;").join("");
}
