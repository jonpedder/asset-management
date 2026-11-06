const STORAGE_KEY = "assetManagement.inventoryPanelWidth.v3";

export function inventoryWidthBounds(workspaceWidth) {
  const width = Number(workspaceWidth) || 0;
  const max = Math.max(340, width - 350);
  const preferredMinimum = width > 1250 ? 480 : 430;
  return { min: Math.min(preferredMinimum, max), max };
}

export function clampInventoryWidth(width, workspaceWidth) {
  const bounds = inventoryWidthBounds(workspaceWidth);
  return Math.min(bounds.max, Math.max(bounds.min, Number(width) || bounds.min));
}

export function initializeInventoryResizer({ workspace, handle, storage = window.localStorage }) {
  if (!workspace || !handle) return () => {};
  const mobile = () => window.matchMedia("(max-width: 850px)").matches;
  const apply = (requested, persist = false) => {
    if (mobile()) {
      workspace.style.removeProperty("--inventory-width");
      handle.removeAttribute("aria-valuenow");
      return null;
    }
    const bounds = inventoryWidthBounds(workspace.clientWidth);
    const width = clampInventoryWidth(requested, workspace.clientWidth);
    workspace.style.setProperty("--inventory-width", `${width}px`);
    handle.setAttribute("aria-valuemin", String(bounds.min));
    handle.setAttribute("aria-valuemax", String(bounds.max));
    handle.setAttribute("aria-valuenow", String(Math.round(width)));
    if (persist) storage?.setItem(STORAGE_KEY, String(Math.round(width)));
    return width;
  };
  const saved = Number(storage?.getItem(STORAGE_KEY));
  if (Number.isFinite(saved) && saved > 0) apply(saved);
  else apply(workspace.querySelector(".inventory-panel")?.getBoundingClientRect().width || workspace.clientWidth * .38);

  let startX = 0;
  let startWidth = 0;
  const move = (event) => apply(startWidth + event.clientX - startX);
  const finish = (event) => {
    if (!handle.hasPointerCapture?.(event.pointerId)) return;
    handle.releasePointerCapture(event.pointerId);
    handle.classList.remove("dragging");
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", finish);
    apply(parseFloat(getComputedStyle(workspace).getPropertyValue("--inventory-width")), true);
  };
  handle.addEventListener("pointerdown", (event) => {
    if (mobile()) return;
    startX = event.clientX;
    startWidth = workspace.querySelector(".inventory-panel")?.getBoundingClientRect().width || workspace.clientWidth * .38;
    handle.setPointerCapture(event.pointerId);
    handle.classList.add("dragging");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    event.preventDefault();
  });
  handle.addEventListener("keydown", (event) => {
    if (mobile() || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const current = workspace.querySelector(".inventory-panel")?.getBoundingClientRect().width || workspace.clientWidth * .38;
    const bounds = inventoryWidthBounds(workspace.clientWidth);
    const requested = event.key === "Home" ? bounds.min : event.key === "End" ? bounds.max : current + (event.key === "ArrowLeft" ? -24 : 24);
    apply(requested, true);
    event.preventDefault();
  });
  handle.addEventListener("dblclick", () => {
    storage?.removeItem(STORAGE_KEY);
    workspace.style.removeProperty("--inventory-width");
    apply(workspace.clientWidth * .38);
  });
  const resize = () => {
    const current = parseFloat(getComputedStyle(workspace).getPropertyValue("--inventory-width"));
    if (Number.isFinite(current)) apply(current);
    else if (mobile()) workspace.style.removeProperty("--inventory-width");
  };
  window.addEventListener("resize", resize);
  return () => window.removeEventListener("resize", resize);
}
