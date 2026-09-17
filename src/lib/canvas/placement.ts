export type XYPosition = { x: number; y: number };

/** Horizontal gap used when a step is added next to the node a wire comes from. */
export const CONNECT_OFFSET_X = 320;

/** Roughly half a node, so a node « at the centre » is visually centred. */
export const NEW_NODE_HALF_SIZE: XYPosition = { x: 140, y: 100 };

/**
 * Position of a node added from a handle without a drop point: left of the
 * anchor node for one of its inputs (target), right of it for its output.
 */
export function connectedNodePosition(anchor: XYPosition, handleType: "source" | "target"): XYPosition {
  return {
    x: anchor.x + (handleType === "target" ? -CONNECT_OFFSET_X : CONNECT_OFFSET_X),
    y: anchor.y,
  };
}

/**
 * Flow coordinates of the centre of the visible pane. `transform` is React
 * Flow's `[translateX, translateY, zoom]` and `size` the pane in pixels.
 */
export function viewportCenterPosition(
  size: { width: number; height: number },
  transform: readonly [number, number, number],
): XYPosition {
  const [translateX, translateY, zoom] = transform;
  return {
    x: (size.width / 2 - translateX) / zoom - NEW_NODE_HALF_SIZE.x,
    y: (size.height / 2 - translateY) / zoom - NEW_NODE_HALF_SIZE.y,
  };
}
