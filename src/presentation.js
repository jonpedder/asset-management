const THEME_VARS = {
  navy: "--app-navy", background: "--app-bg", panel: "--app-panel", panelAlt: "--app-panel-2", panelStrong: "--app-panel-3",
  border: "--app-border", text: "--app-text", muted: "--app-muted", faint: "--app-faint", accent: "--app-accent",
  accentStrong: "--app-accent-strong", blue: "--app-blue", green: "--app-green", red: "--app-red", focus: "--app-focus"
};
const STATUS_VARS = { available: "--status-available", limited: "--status-limited", unavailable: "--status-unavailable", unknown: "--status-unknown" };
const RESOURCE_VARS = { current: "--resource-current", imported: "--resource-imported", mocked: "--resource-mocked", demo: "--resource-demo" };
const isColor = (value) => /^#[0-9a-f]{6}$/i.test(value || "");

export function applyPresentation(config, root = document) {
  const branding = config.branding || {};
  const labels = config.labels || {};
  const style = root.documentElement.style;
  for (const [key, variable] of Object.entries(THEME_VARS)) if (isColor(branding.colors?.[key])) style.setProperty(variable, branding.colors[key]);
  for (const [key, variable] of Object.entries(STATUS_VARS)) if (isColor(config.statusColors?.[key])) style.setProperty(variable, config.statusColors[key]);
  for (const [key, variable] of Object.entries(RESOURCE_VARS)) if (isColor(config.resourceColors?.[key])) style.setProperty(variable, config.resourceColors[key]);
  root.querySelectorAll("[data-brand-name]").forEach((node) => { node.textContent = branding.appName || "Asset Management"; });
  root.querySelectorAll("[data-brand-subtitle]").forEach((node) => { node.textContent = branding.subtitle || "Operational inventory preview"; });
  root.querySelectorAll("[data-brand-logo]").forEach((node) => {
    node.hidden = !branding.logoUrl;
    if (branding.logoUrl) node.src = branding.logoUrl;
  });
  root.querySelectorAll("[data-default-brand-mark]").forEach((node) => { node.hidden = Boolean(branding.logoUrl); });
  for (const [name, value] of Object.entries(labels)) if (value) root.querySelectorAll(`[data-label="${name}"]`).forEach((node) => { node.textContent = value; });
  if (branding.appName) root.title = `${root.title.split("|")[0].trim()} | ${branding.appName}`;
  root.body?.classList.toggle("compact-inventory", Boolean(config.operatorDefaults?.compactInventory));
  return config;
}
