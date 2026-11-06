const text = (value) => String(value ?? "");
const ascii = (value) => text(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[\u2013\u2014]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[^\x20-\x7E]/g, "?");
const escapePdf = (value) => ascii(value).replace(/([\\()])/g, "\\$1");
const validHex = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
const rgb = (hex) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
const color = (hex) => rgb(hex).map((value) => value.toFixed(3)).join(" ");
const columns = [
  ["Asset Type", "assetType", 100], ["Dept", "department", 55], ["Category", "category", 70], ["Est. Qty", "quantity", 35],
  ["Availability", "availability", 55], ["EOC Role / Use", "eocRole", 80], ["Operator Required?", "operator", 65], ["Status", "status", 60],
  ["Gap Description", "gapDescription", 65], ["Priority", "priority", 50], ["Est. Unit Cost", "unitCost", 70], ["Notes / Source", "notes", 47]
];
const groupColors = ["#2f7d32", "#1469b8", "#e95d00", "#c51f2b", "#4d8c2b"];
function command(value, x, y, size, font = "F1", fill = "#071824") { return `BT ${color(fill)} rg /${font} ${size} Tf ${x} ${y} Td (${escapePdf(value)}) Tj ET`; }
function wrap(value, width) {
  const limit = Math.max(4, Math.floor(width / 3.4)); const words = ascii(value || "—").replace(/\s+/g, " ").trim().split(" "); const lines = []; let line = "";
  for (const word of words) { if (!line) line = word; else if (`${line} ${word}`.length <= limit) line += ` ${word}`; else { lines.push(line); line = word; } }
  if (line) lines.push(line); return lines.length ? lines.slice(0, 3) : ["—"];
}
function cellFill(key, value, rowIndex) {
  const normalized = ascii(value).toLowerCase();
  if (key === "availability" || key === "status") {
    if (/available|have|ready|in service/.test(normalized)) return "#d9ead3";
    if (/gap|need|unavailable|out/.test(normalized)) return "#f4cccc";
    if (/partial|committed|en route|moderate|limited/.test(normalized)) return "#fff2cc";
  }
  if (key === "operator") {
    if (/^no$|not required/.test(normalized)) return "#d9ead3";
    if (/yes|required|licensed|certified/.test(normalized)) return "#f4cccc";
  }
  if (key === "priority") {
    if (/critical|p1/.test(normalized)) return "#f4cccc";
    if (/high|p2/.test(normalized)) return "#fce5cd";
  }
  return rowIndex % 2 ? "#edf3f8" : "#ffffff";
}
function drawTableHeader(commands, y) {
  let x = 20;
  columns.forEach(([label,, width]) => { commands.push(`${color("#2f6491")} rg ${x} ${y - 18} ${width} 18 re f`, `${color("#9fb5c4")} RG .4 w ${x} ${y - 18} ${width} 18 re S`); const lines = wrap(label, width); lines.slice(0, 2).forEach((line, index) => commands.push(command(line, x + 2, y - 7 - index * 6, 5.5, "F2", "#ffffff"))); x += width; });
  return y - 18;
}
function pageHeader(commands, report, branding, generatedAt, firstPage) {
  commands.push(`${color("#173b64")} rg 0 566 792 46 re f`, `${color("#6bb36b")} rg 0 609 792 3 re f`, command(`${branding.appName} - EOC FIELD ASSET RESOURCE LIBRARY | ${report.title}`, 18, 590, 12, "F2", "#ffffff"), command(`${branding.subtitle} | ${report.scopeLabel} | Generated ${generatedAt.toLocaleString()}`, 18, 574, 6.5, "F3", "#d7e9f5"));
  if (!firstPage) return 554;
  const metrics = [["Resource Records", report.metrics.records], ["Est. Quantity", report.metrics.quantity], ["Departments", report.metrics.departments], ["Asset Categories", report.metrics.categories], ["Available Qty", report.metrics.available]];
  const width = 150.4; let x = 20;
  metrics.forEach(([label, value]) => { commands.push(`${color("#d9e7f2")} rg ${x} 520 ${width} 32 re f`, `${color("#9fb5c4")} RG .5 w ${x} 520 ${width} 32 re S`, command(label, x + 5, 541, 5.8, "F2", "#5b6770"), command(value, x + 5, 526, 12, "F2", "#173b64")); x += width; });
  return 510;
}
function buildPages(report, branding, generatedAt) {
  const pages = []; let commands = []; let y = pageHeader(commands, report, branding, generatedAt, true); y = drawTableHeader(commands, y); let rowIndex = 0;
  const newPage = () => { pages.push(commands); commands = []; y = pageHeader(commands, report, branding, generatedAt, false); y = drawTableHeader(commands, y); };
  report.groups.forEach((group, groupIndex) => {
    if (y < 65) newPage();
    commands.push(`${color(groupColors[groupIndex % groupColors.length])} rg 20 ${y - 15} 752 15 re f`, command(`${group.department.toUpperCase()} - ${group.records.length} RESOURCE${group.records.length === 1 ? "" : "S"}`, 24, y - 10, 7, "F2", "#ffffff")); y -= 15;
    group.records.forEach((row) => {
      const wrapped = columns.map(([, key, width]) => wrap(row[key], width)); const lineCount = Math.max(...wrapped.map((lines) => lines.length)); const rowHeight = Math.max(15, 5 + lineCount * 6);
      if (y - rowHeight < 28) { newPage(); commands.push(`${color(groupColors[groupIndex % groupColors.length])} rg 20 ${y - 15} 752 15 re f`, command(`${group.department.toUpperCase()} - CONTINUED`, 24, y - 10, 7, "F2", "#ffffff")); y -= 15; }
      let x = 20;
      columns.forEach(([, key, width], columnIndex) => { const fill = cellFill(key, row[key], rowIndex); commands.push(`${color(fill)} rg ${x} ${y - rowHeight} ${width} ${rowHeight} re f`, `${color("#aebbc4")} RG .35 w ${x} ${y - rowHeight} ${width} ${rowHeight} re S`); wrapped[columnIndex].forEach((line, lineIndex) => commands.push(command(line, x + 2, y - 8 - lineIndex * 6, 5.2, key === "assetType" ? "F2" : key === "notes" ? "F3" : "F1", "#071824"))); x += width; });
      y -= rowHeight; rowIndex += 1;
    });
  });
  pages.push(commands); return pages;
}
function buildPdf(pages) {
  const objects = [null, "<< /Type /Catalog /Pages 2 0 R >>", null, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>"]; let nextId = 6; const kids = [];
  pages.forEach((page, index) => { const pageId = nextId++; const contentId = nextId++; kids.push(`${pageId} 0 R`); const footer = [command("INTERNAL WORKING REPORT - Validate inventory and availability before operational use.", 20, 11, 5.5, "F3", "#5b6770"), command(`Page ${index + 1} of ${pages.length}`, 730, 11, 5.5, "F1", "#5b6770")]; const stream = [...page, ...footer].join("\n"); objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentId} 0 R >>`; objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`; });
  objects[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`; let pdf = "%PDF-1.4\n"; const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) { offsets[id] = pdf.length; pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`; }
  const xref = pdf.length; pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`; for (let id = 1; id < objects.length; id += 1) pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`; return new Blob([pdf], { type: "application/pdf" });
}
export function buildGapStatusReportPdf(report, generatedAt = new Date(), brandingInput = {}) {
  const branding = { appName: ascii(brandingInput.appName || "Asset Management").slice(0, 60), subtitle: ascii(brandingInput.subtitle || "Current Inventory & Gap Status").slice(0, 100), colors: { navy: validHex(brandingInput.colors?.navy, "#173b64") } };
  return buildPdf(buildPages(report, branding, generatedAt));
}
