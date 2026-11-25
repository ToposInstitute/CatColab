/** Layout direction for graph layouts with a primary/preferred direction. */
export enum Direction {
    Horizontal = "horizontal",
    Vertical = "vertical",
}

export type SchemaERDConfig = {
    direction?: Direction;
};

export const newSchemaERDConfig = (): SchemaERDConfig => ({
    direction: Direction.Vertical,
});
