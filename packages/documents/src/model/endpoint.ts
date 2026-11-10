import type { Ob } from "catcolab-document-types";
import { isRecord } from "../document/parse-structure";
import type { MorphismEndpoint, MorphismEndpoints, MorphismType } from "../shape";
import type { DeepReadonly } from "../util/deep-readonly";
import { morphismTypesEqual, objectTypesEqual } from "./equality";

export type EndpointData<Value> = Value | readonly (Value | null)[];

export function getMorphismEndpoints(
    type: MorphismType | undefined,
): MorphismEndpoints | undefined {
    return (type as (MorphismType & { readonly endpoints?: MorphismEndpoints }) | undefined)
        ?.endpoints;
}

export function morphismEndpointsEqual(left: MorphismEndpoint, right: MorphismEndpoint): boolean {
    if (left.kind === "tabulator") {
        return right.kind === "tabulator" && morphismTypesEqual(left.morType, right.morType);
    }
    if (left.kind === "operation-list") {
        return (
            right.kind === "operation-list" &&
            left.modality === right.modality &&
            left.apply.tag === right.apply.tag &&
            left.apply.content === right.apply.content
        );
    }
    if (left.kind === "object-list") {
        return (
            right.kind === "object-list" &&
            left.modality === right.modality &&
            objectTypesEqual(left.obType, right.obType)
        );
    }
    return right.kind === "object" && objectTypesEqual(left.obType, right.obType);
}

export function isSingleObjectEndpoint<Value extends { readonly kind: string }>(
    value: EndpointData<Value> | null | undefined,
): value is Extract<Value, { readonly kind: "object" }> {
    return isRecord(value) && "kind" in value && value.kind === "object";
}

type ListEndpoint = Extract<MorphismEndpoint, { readonly kind: "object-list" | "operation-list" }>;

function findListEndpointMismatch(
    ob: DeepReadonly<Ob> | null,
    endpoint: MorphismEndpoint | undefined,
): ListEndpoint | undefined {
    if (
        ob === null ||
        !endpoint ||
        (endpoint.kind !== "object-list" && endpoint.kind !== "operation-list")
    ) {
        return undefined;
    }
    const list =
        endpoint.kind === "operation-list"
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
    if (endpoint?.kind === "tabulator") {
        return ob === null || (ob.tag === "Tabulated" && ob.content.tag === "Basic")
            ? undefined
            : { kind: "tabulated-morphism" };
    }
    const mismatch = findListEndpointMismatch(ob, endpoint);
    if (mismatch) {
        return { kind: "list", endpoint: mismatch };
    }
    if (ob !== null && (!endpoint || endpoint.kind === "object") && ob.tag !== "Basic") {
        return { kind: "single-object" };
    }
    return undefined;
}

export function resolveEndpointDataFromOb<ObjectValue, MorphismValue = never>(
    ob: DeepReadonly<Ob> | null,
    resolve: (id: string) => ObjectValue | null,
    resolveMorphism?: (id: string) => MorphismValue | null,
): EndpointData<ObjectValue> | MorphismValue | null {
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
