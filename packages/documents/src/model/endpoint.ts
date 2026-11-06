import type { Modality, Ob } from "catcolab-document-types";
import { isRecord } from "../document/parse-structure";
import type { MorphismEndpoint, MorphismEndpoints, MorphismType } from "../shape";
import type { DeepReadonly } from "../util/deep-readonly";
import { objectTypesEqual } from "./equality";

export type EndpointData<Value> = Value | readonly (Value | null)[];

export function getMorphismEndpoints(
    type: MorphismType | undefined,
): MorphismEndpoints | undefined {
    return (type as (MorphismType & { readonly endpoints?: MorphismEndpoints }) | undefined)
        ?.endpoints;
}

export function morphismEndpointsEqual(left: MorphismEndpoint, right: MorphismEndpoint): boolean {
    if ("apply" in left) {
        return (
            "apply" in right &&
            left.modality === right.modality &&
            left.apply.tag === right.apply.tag &&
            left.apply.content === right.apply.content
        );
    }
    if ("obType" in left) {
        return (
            "obType" in right &&
            left.modality === right.modality &&
            objectTypesEqual(left.obType, right.obType)
        );
    }
    return !("modality" in right) && objectTypesEqual(left, right);
}

export function isSingleObjectEndpoint<Value extends { readonly kind: string }>(
    value: EndpointData<Value> | null | undefined,
): value is Extract<Value, { readonly kind: "object" }> {
    return isRecord(value) && "kind" in value && value.kind === "object";
}

type ListEndpoint = Extract<MorphismEndpoint, { readonly modality: Modality }>;

function findListEndpointMismatch(
    ob: DeepReadonly<Ob> | null,
    endpoint: MorphismEndpoint | undefined,
): ListEndpoint | undefined {
    if (ob === null || !endpoint || !("modality" in endpoint)) {
        return undefined;
    }
    const list =
        "apply" in endpoint
            ? ob.tag === "App" &&
              ob.content.op.tag === endpoint.apply.tag &&
              ob.content.op.content === endpoint.apply.content
                ? ob.content.ob
                : null
            : ob;
    return list?.tag === "List" &&
        list.content.modality === endpoint.modality &&
        list.content.objects.every((object) => object === null || object.tag === "Basic")
        ? undefined
        : endpoint;
}

export type EndpointMismatch =
    | { readonly kind: "single-object" }
    | { readonly kind: "tabulated-morphism" }
    | { readonly kind: "list"; readonly endpoint: ListEndpoint };

export function validateEndpoint(
    ob: DeepReadonly<Ob> | null,
    endpoint: MorphismEndpoint | undefined,
): EndpointMismatch | undefined {
    if (endpoint && "tag" in endpoint && endpoint.tag === "Tabulator") {
        return ob === null || (ob.tag === "Tabulated" && ob.content.tag === "Basic")
            ? undefined
            : { kind: "tabulated-morphism" };
    }
    const mismatch = findListEndpointMismatch(ob, endpoint);
    if (mismatch) {
        return { kind: "list", endpoint: mismatch };
    }
    if (ob !== null && (!endpoint || !("modality" in endpoint)) && ob.tag !== "Basic") {
        return { kind: "single-object" };
    }
    return undefined;
}

export function resolveEndpointDataFromOb<Value>(
    ob: DeepReadonly<Ob> | null,
    resolve: (id: string) => Value | null,
    resolveMorphism?: (id: string) => Value | null,
): EndpointData<Value> | null {
    if (ob === null) {
        return null;
    }
    if (ob.tag === "Basic") {
        return resolve(ob.content);
    }
    if (ob.tag === "Tabulated" && ob.content.tag === "Basic") {
        return resolveMorphism?.(ob.content.content) ?? null;
    }
    const list = ob.tag === "App" ? ob.content.ob : ob;
    if (list?.tag === "List") {
        return list.content.objects.map((object) =>
            object?.tag === "Basic" ? resolve(object.content) : null,
        );
    }
    return null;
}
