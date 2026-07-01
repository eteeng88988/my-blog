import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const sourceDir = process.argv[2] || "E:/C盘桌面/2023年最新450个搞钱玩法合集";
const rawTextPath = path.join(sourceDir, "2023年最新450个搞钱玩法合集.txt");
const classifiedPath = path.join(sourceDir, "2023年最新450个搞钱玩法合集_重新分类目录.txt");
const outputDir = path.join(repoRoot, "public/content/posts/money-playbook");
const reportJsonPath = path.join(repoRoot, "outputs/money-playbook-import-report.json");
const reportMdPath = path.join(repoRoot, "outputs/money-playbook-import-report.md");

function readUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function writeUtf8(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function splitValues(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function unique(items) {
  return [...new Set(items.map((item) => String(item).trim()).filter(Boolean))];
}

function parseClassifiedDirectory(text) {
  const items = [];
  const categoryMap = new Map();
  let currentCategory = "";
  let currentSubcategory = "";

  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    const heading = trimmed.match(/^【(.+?)】(?:（(\d+)篇）)?$/);
    if (heading && !line.startsWith(" ")) {
      currentCategory = heading[1];
      currentSubcategory = "";
      if (!categoryMap.has(currentCategory)) categoryMap.set(currentCategory, new Set());
      return;
    }
    if (heading && line.startsWith("  ")) {
      currentSubcategory = heading[1];
      if (currentCategory) categoryMap.get(currentCategory).add(currentSubcategory);
      return;
    }

    const item = line.match(/^\s+(\d{3})\.\s+P\s*(\d+)(?:\s*-\s*(\d+))?\s+(.+)$/);
    if (!item) return;
    const startPage = Number(item[2]);
    items.push({
      number: item[1],
      order: Number(item[1]),
      startPage,
      endPage: item[3] ? Number(item[3]) : startPage,
      title: item[4].trim(),
      category: currentCategory,
      subcategory: currentSubcategory
    });
  });

  return {
    items: items.sort((a, b) => a.order - b.order),
    categories: [...categoryMap.entries()].map(([name, children]) => ({ name, children: [...children] }))
  };
}

function splitLinesWithOffsets(text) {
  const lines = [];
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf("\n", start);
    if (end === -1) end = text.length;
    const eolEnd = end < text.length ? end + 1 : end;
    const rawLine = text.slice(start, end).replace(/\r$/, "");
    lines.push({ text: rawLine, start, end, nextStart: eolEnd });
    start = eolEnd;
  }
  return lines;
}

function findBodyLineIndex(lines) {
  const direct = lines.findIndex((line, index) => index > 450 && line.text.trim() === "12");
  if (direct !== -1) return direct;
  const fallback = lines.findIndex((line) => line.text.trim() === "12");
  if (fallback !== -1) return fallback;
  throw new Error("没有在原始 TXT 中找到正文起始页码 12。");
}

function buildPageStarts(lines, firstLineIndex) {
  const starts = new Map();
  let expected = 12;
  for (let index = firstLineIndex; index < lines.length && expected <= 730; index += 1) {
    if (lines[index].text.trim() === String(expected)) {
      starts.set(expected, lines[index]);
      expected += 1;
    }
  }
  return starts;
}

function isUsefulChar(char) {
  return /[\p{L}\p{N}]/u.test(char);
}

function normalizeText(value) {
  let output = "";
  for (const char of String(value || "")) {
    if (isUsefulChar(char)) output += char.toLowerCase();
  }
  return output;
}

function buildNormalizedMap(text, startRawIndex) {
  let normalized = "";
  const rawIndexes = [];
  for (let index = startRawIndex; index < text.length;) {
    const codePoint = text.codePointAt(index);
    const char = String.fromCodePoint(codePoint);
    if (isUsefulChar(char)) {
      normalized += char.toLowerCase();
      rawIndexes.push(index);
    }
    index += char.length;
  }
  return { normalized, rawIndexes };
}

function lowerBound(values, target) {
  let left = 0;
  let right = values.length;
  while (left < right) {
    const mid = (left + right) >> 1;
    if (values[mid] < target) left = mid + 1;
    else right = mid;
  }
  return left;
}

function pageAfterMarker(pageStarts, page, rawLength) {
  const marker = pageStarts.get(page);
  return marker ? marker.nextStart : rawLength;
}

function pageLineStart(pageStarts, page, rawLength) {
  const marker = pageStarts.get(page);
  return marker ? marker.start : rawLength;
}

function findTitleStart(raw, normMap, pageStarts, item) {
  const normalizedTitle = normalizeText(item.title);
  const startRaw = pageAfterMarker(pageStarts, item.startPage, 0);
  const endRaw = pageLineStart(pageStarts, item.startPage + 3, raw.length);
  const searchStart = lowerBound(normMap.rawIndexes, startRaw);
  const searchEnd = lowerBound(normMap.rawIndexes, endRaw);
  const haystack = normMap.normalized.slice(searchStart, searchEnd);

  const exact = haystack.indexOf(normalizedTitle);
  if (exact !== -1) {
    return {
      rawStart: normMap.rawIndexes[searchStart + exact],
      method: "exact-title",
      matchedChars: normalizedTitle.length
    };
  }

  const maxPrefix = Math.min(56, normalizedTitle.length);
  const minPrefix = Math.min(12, maxPrefix);
  for (let length = maxPrefix; length >= minPrefix; length -= 1) {
    const needle = normalizedTitle.slice(0, length);
    const offset = haystack.indexOf(needle);
    if (offset !== -1) {
      return {
        rawStart: normMap.rawIndexes[searchStart + offset],
        method: `prefix-title-${length}`,
        matchedChars: length
      };
    }
  }

  return {
    rawStart: startRaw || pageLineStart(pageStarts, item.startPage, raw.length),
    method: "page-fallback",
    matchedChars: 0
  };
}

function removePageMarkerLines(body, rawStart, rawEnd, pageStarts) {
  const removals = [];
  for (const [page, line] of pageStarts.entries()) {
    if (line.start <= rawStart || line.start >= rawEnd) continue;
    const localStart = line.start - rawStart;
    const localEnd = Math.min(line.nextStart, rawEnd) - rawStart;
    const fragment = body.slice(localStart, localEnd).replace(/\r?\n$/, "");
    if (fragment.trim() === String(page)) {
      removals.push({ page, start: localStart, end: localEnd });
    }
  }

  let cleaned = body;
  for (const removal of [...removals].sort((a, b) => b.start - a.start)) {
    cleaned = `${cleaned.slice(0, removal.start)}${cleaned.slice(removal.end)}`;
  }
  return { body: cleaned, removedPages: removals.map((item) => item.page) };
}

function stripTrailingImportArtifacts(body, hasNextArticle) {
  let cleaned = body.replace(/[ \t\r\n]+$/g, "");
  let removedTrailingQuote = false;
  let removedReadCount = "";

  const artifact = cleaned.match(/(\d{3,8})([ \t\r\n“”"'\u300c\u300d《》〈〉【】（）()，,、：:；;？?！!·.。\[\]]*)$/u);
  if (artifact && (hasNextArticle || artifact[1].length >= 5)) {
    removedReadCount = artifact[1];
    removedTrailingQuote = /[“”"'\u300c\u300d《》〈〉【】]/u.test(artifact[2] || "");
    cleaned = cleaned.slice(0, artifact.index).replace(/[ \t\r\n]+$/g, "");
  }

  const danglingTitleLead = hasNextArticle ? cleaned.match(/[ \t\r\n]*[“"\u300c《〈【]+$/u) : null;
  if (danglingTitleLead) {
    removedTrailingQuote = true;
    cleaned = cleaned.slice(0, danglingTitleLead.index).replace(/[ \t\r\n]+$/g, "");
  }

  return { body: cleaned, removedTrailingQuote, removedReadCount };
}

function cutIncludedNextHeader(body, nextItem) {
  if (!nextItem) return { body, removedIncludedNextHeader: false };
  const normalizedTitle = normalizeText(nextItem.title);
  if (normalizedTitle.length < 8) return { body, removedIncludedNextHeader: false };

  const normMap = buildNormalizedMap(body, 0);
  const minRawOffset = Math.max(80, Math.floor(body.length * 0.35));
  const searchStart = lowerBound(normMap.rawIndexes, minRawOffset);
  const haystack = normMap.normalized.slice(searchStart);
  const maxPrefix = Math.min(42, normalizedTitle.length);
  const minPrefix = Math.min(12, maxPrefix);

  for (let length = maxPrefix; length >= minPrefix; length -= 1) {
    const offset = haystack.indexOf(normalizedTitle.slice(0, length));
    if (offset === -1) continue;
    const cutAt = normMap.rawIndexes[searchStart + offset];
    if (cutAt > 0 && cutAt < body.length) {
      return { body: body.slice(0, cutAt), removedIncludedNextHeader: true };
    }
  }

  return { body, removedIncludedNextHeader: false };
}

function cleanImportedBody(body, rawStart, rawEnd, pageStarts, nextItem) {
  const pageClean = removePageMarkerLines(body, rawStart, rawEnd, pageStarts);
  const headerClean = cutIncludedNextHeader(pageClean.body, nextItem);
  const tailClean = stripTrailingImportArtifacts(headerClean.body, Boolean(nextItem));
  return {
    body: tailClean.body,
    removedPages: pageClean.removedPages,
    removedIncludedNextHeader: headerClean.removedIncludedNextHeader,
    removedTrailingQuote: tailClean.removedTrailingQuote,
    removedReadCount: tailClean.removedReadCount
  };
}

function frontmatterValue(value) {
  return String(value || "").replace(/\r?\n/g, " ").trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function parseFrontMatter(markdown, filePath) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const meta = {};
  let body = markdown;
  if (match) {
    body = match[2];
    match[1].split("\n").forEach((line) => {
      const index = line.indexOf(":");
      if (index === -1) return;
      meta[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    });
  }
  return { filePath, meta, body };
}

function postIndexEntry(post) {
  const categories = splitValues(post.meta.categories || post.meta.category);
  const subcategories = splitValues(post.meta.subcategories || post.meta.subcategory);
  return {
    path: `/${post.filePath.replace(/^public\//, "").replace(/\\/g, "/")}`,
    title: post.meta.title || path.basename(post.filePath),
    date: post.meta.date || "",
    showDate: post.meta.showDate === "false" ? false : true,
    category: categories[0] || "",
    categories,
    subcategory: subcategories[0] || "",
    subcategories,
    tags: splitValues(post.meta.tags),
    cover: post.meta.cover || "",
    summary: post.meta.summary || post.body.replace(/\s+/g, " ").slice(0, 160),
    featured: post.meta.featured === "true",
    status: post.meta.status || "published",
    format: post.meta.format || ""
  };
}

function walkMarkdown(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkMarkdown(fullPath);
    if (!entry.isFile() || !entry.name.endsWith(".md")) return [];
    return [fullPath];
  });
}

function mergeCategories(existing, imported) {
  const map = new Map();
  for (const item of [...(existing.items || []), ...imported]) {
    if (!item.name) continue;
    if (!map.has(item.name)) map.set(item.name, new Set());
    for (const child of item.children || []) map.get(item.name).add(child);
  }
  return {
    items: [...map.entries()].map(([name, children]) => ({ name, children: [...children] }))
  };
}

function buildMarkdown(item, body) {
  const title = frontmatterValue(item.title);
  const category = frontmatterValue(item.category);
  const subcategory = frontmatterValue(item.subcategory);
  const summary = title.slice(0, 160);
  return [
    "---",
    `title: ${title}`,
    "date: 2023-01-01",
    "showDate: false",
    `category: ${category}`,
    `categories: ${category}`,
    `subcategory: ${subcategory}`,
    `subcategories: ${subcategory}`,
    `tags: ${category},${subcategory}`,
    "cover: ",
    `summary: ${summary}`,
    "featured: false",
    "status: draft",
    "format: raw",
    "sourceCollection: 2023年最新450个搞钱玩法合集",
    `sourceNumber: ${item.number}`,
    `sourceStartPage: ${item.startPage}`,
    `sourceEndPage: ${item.endPage}`,
    `sourceBodySha256: ${sha256(body)}`,
    "---",
    "",
    body
  ].join("\n");
}

function buildReport(report) {
  const methodCounts = report.items.reduce((acc, item) => {
    acc[item.method] = (acc[item.method] || 0) + 1;
    return acc;
  }, {});
  const removedPageMarkerCount = report.items.reduce((count, item) => count + item.removedPages.length, 0);
  const removedReadCount = report.items.filter((item) => item.removedReadCount).length;
  const removedTrailingQuote = report.items.filter((item) => item.removedTrailingQuote).length;
  const removedIncludedNextHeader = report.items.filter((item) => item.removedIncludedNextHeader).length;
  const fallbackItems = report.items.filter((item) => item.method.includes("fallback") || item.warning);
  return [
    "# 2023年最新450个搞钱玩法合集 导入报告",
    "",
    `- 分类目录文章数：${report.totalItems}`,
    `- 生成草稿文章数：${report.generatedPosts}`,
    `- 一级分类数：${report.categoryCount}`,
    `- 二级分类数：${report.subcategoryCount}`,
    `- 正文页码识别数：${report.pageCount}`,
    `- 匹配方式：${Object.entries(methodCounts).map(([name, count]) => `${name}=${count}`).join("，")}`,
    `- 已移除正文页码行：${removedPageMarkerCount}`,
    `- 已移除结尾阅读量：${removedReadCount}`,
    `- 已移除下一篇标题引号：${removedTrailingQuote}`,
    `- 已截断误入的下一篇标题：${removedIncludedNextHeader}`,
    "",
    "## 需要人工复核",
    "",
    fallbackItems.length
      ? fallbackItems.map((item) => `- ${item.number}. P${item.startPage}-${item.endPage} ${item.title}（${item.method}${item.warning ? `；${item.warning}` : ""}）`).join("\n")
      : "- 无",
    ""
  ].join("\n");
}

const raw = readUtf8(rawTextPath);
const classified = readUtf8(classifiedPath);
const parsed = parseClassifiedDirectory(classified);
const lines = splitLinesWithOffsets(raw);
const bodyLineIndex = findBodyLineIndex(lines);
const pageStarts = buildPageStarts(lines, bodyLineIndex);
const normMap = buildNormalizedMap(raw, lines[bodyLineIndex].start);

const starts = parsed.items.map((item) => ({
  ...item,
  ...findTitleStart(raw, normMap, pageStarts, item)
}));

starts.sort((a, b) => a.order - b.order);
for (let index = 0; index < starts.length; index += 1) {
  const previous = starts[index - 1];
  if (previous && starts[index].rawStart <= previous.rawStart) {
    starts[index].warning = "起点顺序异常，已使用页码位置兜底";
    starts[index].rawStart = Math.max(pageAfterMarker(pageStarts, starts[index].startPage, previous.rawStart + 1), previous.rawStart + 1);
    starts[index].method = "page-order-fallback";
  }
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

const itemReports = [];
for (let index = 0; index < starts.length; index += 1) {
  const item = starts[index];
  const next = starts[index + 1];
  const rawEnd = next ? next.rawStart : raw.length;
  const rawBody = raw.slice(item.rawStart, rawEnd);
  const cleaned = cleanImportedBody(rawBody, item.rawStart, rawEnd, pageStarts, next);
  const body = cleaned.body;
  const relativePath = `public/content/posts/money-playbook/${item.number}.md`;
  writeUtf8(path.join(repoRoot, relativePath), buildMarkdown(item, body));
  itemReports.push({
    number: item.number,
    title: item.title,
    category: item.category,
    subcategory: item.subcategory,
    startPage: item.startPage,
    endPage: item.endPage,
    method: item.method,
    matchedChars: item.matchedChars,
    rawStart: item.rawStart,
    rawEnd,
    rawBodyChars: rawBody.length,
    bodyChars: body.length,
    bodySha256: sha256(body),
    removedPages: cleaned.removedPages,
    removedIncludedNextHeader: cleaned.removedIncludedNextHeader,
    removedReadCount: cleaned.removedReadCount,
    removedTrailingQuote: cleaned.removedTrailingQuote,
    warning: item.warning || ""
  });
}

const existingCategoriesPath = path.join(repoRoot, "public/config/categories.json");
const existingCategories = fs.existsSync(existingCategoriesPath) ? JSON.parse(readUtf8(existingCategoriesPath)) : { items: [] };
writeUtf8(existingCategoriesPath, `${JSON.stringify(mergeCategories(existingCategories, parsed.categories), null, 2)}\n`);

const postFiles = walkMarkdown(path.join(repoRoot, "public/content/posts"))
  .map((filePath) => parseFrontMatter(readUtf8(filePath), path.relative(repoRoot, filePath).replace(/\\/g, "/")))
  .map(postIndexEntry)
  .sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.path.localeCompare(b.path));
writeUtf8(path.join(repoRoot, "public/content/posts/index.json"), `${JSON.stringify(postFiles, null, 2)}\n`);

const report = {
  sourceDir,
  rawTextPath,
  classifiedPath,
  totalItems: parsed.items.length,
  generatedPosts: itemReports.length,
  categoryCount: parsed.categories.length,
  subcategoryCount: unique(parsed.categories.flatMap((item) => item.children)).length,
  pageCount: pageStarts.size,
  outputDir: path.relative(repoRoot, outputDir).replace(/\\/g, "/"),
  items: itemReports
};
writeUtf8(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeUtf8(reportMdPath, buildReport(report));

console.log(JSON.stringify({
  generatedPosts: report.generatedPosts,
  categoryCount: report.categoryCount,
  subcategoryCount: report.subcategoryCount,
  pageCount: report.pageCount,
  report: path.relative(repoRoot, reportMdPath).replace(/\\/g, "/"),
  fallbackCount: itemReports.filter((item) => item.method.includes("fallback") || item.warning).length,
  removedPageMarkerCount: itemReports.reduce((count, item) => count + item.removedPages.length, 0),
  removedReadCount: itemReports.filter((item) => item.removedReadCount).length,
  removedTrailingQuote: itemReports.filter((item) => item.removedTrailingQuote).length,
  removedIncludedNextHeader: itemReports.filter((item) => item.removedIncludedNextHeader).length
}, null, 2));
