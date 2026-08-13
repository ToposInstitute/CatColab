import type { Point } from "./graph_layout";

/** Calculate a position offset perpendicular to the vector from source to target.
 *
 * This is useful for placing labels near the target of an edge, offset to the side
 * so they don't overlap with the edge itself.
 *
 * @param sourcePos - The source point
 * @param targetPos - The target point
 * @param offset - The perpendicular distance to offset from the target (default: 10)
 * @returns A point offset from the target perpendicular to the source-target vector
 */
export function perpendicularLabelPosition(sourcePos: Point, targetPos: Point, offset = 10): Point {
    const vec = { x: targetPos.x - sourcePos.x, y: targetPos.y - sourcePos.y };
    const scale = offset / Math.sqrt(vec.x ** 2 + vec.y ** 2);
    return { x: targetPos.x - scale * vec.y, y: targetPos.y + scale * vec.x };
}
