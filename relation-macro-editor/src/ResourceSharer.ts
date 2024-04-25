interface ResourceSharer {
    variables: Array<string>,
    params: Array<string>,
    updateString: string,
    update: (state: Record<string, number>, params: Record<string, number>) => Record<string, number>
}

interface Junction {
    name: string,
    exposed: boolean
}

interface PrimBox {
    kind: "prim",
    variableMapping: Record<string, string>,
    content: ResourceSharer
}

interface CompositeBox {
    kind: "composite",
    variableMapping: Record<string, string>,
    content: CompositeResourceSharer
}

interface CompositeResourceSharer {
    junctions: Array<Junction>,
    boxes: Array<PrimBox | CompositeBox>
}
