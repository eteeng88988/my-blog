const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const indexPath = path.join(root, "public", "content", "posts", "index.json");

const image = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=80`;

const pools = {
  startup: [
    image("photo-1497366216548-37526070297c"),
    image("photo-1556761175-b413da4baf72"),
    image("photo-1552664730-d307ca884978"),
    image("photo-1522202176988-66273c2fd55f"),
    image("photo-1504384308090-c894fdcc538d")
  ],
  marketing: [
    image("photo-1460925895917-afdab827c52f"),
    image("photo-1504868584819-f8e8b4b6d7e3"),
    image("photo-1454165804606-c3d57bc86b40"),
    image("photo-1517245386807-bb43f82c33c4"),
    image("photo-1551288049-bebda4e38f71")
  ],
  video: [
    image("photo-1516035069371-29a1b244cc32"),
    image("photo-1492691527719-9d1e07e534b4"),
    image("photo-1485846234645-a62644f84728"),
    image("photo-1512790182412-b19e6d62bc39"),
    image("photo-1500648767791-00dcc994a43e")
  ],
  ecommerce: [
    image("photo-1472851294608-062f824d29cc"),
    image("photo-1523275335684-37898b6baf30"),
    image("photo-1542291026-7eec264c27ff"),
    image("photo-1607082348824-0a96f2a4b9da"),
    image("photo-1556740738-b6a63e27c4df")
  ],
  content: [
    image("photo-1499750310107-5fef28a66643"),
    image("photo-1455390582262-044cdead277a"),
    image("photo-1515378791036-0648a3ef77b2"),
    image("photo-1486312338219-ce68d2c6f44d"),
    image("photo-1516321318423-f06f85e504b3")
  ],
  risk: [
    image("photo-1526374965328-7f61d4dc18c5"),
    image("photo-1510511459019-5dda7724fd87"),
    image("photo-1563986768494-4dee2763ff3f"),
    image("photo-1555949963-aa79dcee981c"),
    image("photo-1516321318423-f06f85e504b3")
  ],
  social: [
    image("photo-1521737604893-d14cc237f11d"),
    image("photo-1557804506-669a67965ba0"),
    image("photo-1529333166437-7750a6dd5a70"),
    image("photo-1521790797524-b2497295b8a0"),
    image("photo-1519389950473-47ba0277781c")
  ],
  tools: [
    image("photo-1515879218367-8466d910aaa4"),
    image("photo-1498050108023-c5249f4df085"),
    image("photo-1555066931-4365d14bab8c"),
    image("photo-1461749280684-dccba630e2f6"),
    image("photo-1516321318423-f06f85e504b3")
  ],
  local: [
    image("photo-1441986300917-64674bd600d8"),
    image("photo-1514933651103-005eec06c04b"),
    image("photo-1521791136064-7986c2920216"),
    image("photo-1500530855697-b586d89ba3ee"),
    image("photo-1534237710431-e2fc698436d0")
  ],
  finance: [
    image("photo-1526304640581-d334cdbbf45e"),
    image("photo-1554224155-6726b3ff858f"),
    image("photo-1520607162513-77705c0f0d4a"),
    image("photo-1507679799987-c73779587ccf"),
    image("photo-1553729459-efe14ef6055d")
  ],
  web: [
    image("photo-1461749280684-dccba630e2f6"),
    image("photo-1498050108023-c5249f4df085"),
    image("photo-1515879218367-8466d910aaa4"),
    image("photo-1484417894907-623942c8ee29"),
    image("photo-1518770660439-4636190af475")
  ],
  analysis: [
    image("photo-1551288049-bebda4e38f71"),
    image("photo-1454165804606-c3d57bc86b40"),
    image("photo-1504868584819-f8e8b4b6d7e3"),
    image("photo-1520607162513-77705c0f0d4a"),
    image("photo-1497366754035-f200968a6e72")
  ],
  education: [
    image("photo-1513258496099-48168024aec0"),
    image("photo-1524995997946-a1c2e315a42f"),
    image("photo-1434030216411-0b793f4b4173"),
    image("photo-1509062522246-3755977927d7"),
    image("photo-1522202176988-66273c2fd55f")
  ],
  creative: [
    image("photo-1511512578047-dfb367046420"),
    image("photo-1493711662062-fa541adb3fc8"),
    image("photo-1484704849700-f032a568e944"),
    image("photo-1550745165-9bc0b252726f"),
    image("photo-1511379938547-c1f69419868d")
  ],
  design: [
    image("photo-1518005020951-eccb494ad742"),
    image("photo-1523726491678-bf852e717f6a"),
    image("photo-1500530855697-b586d89ba3ee"),
    image("photo-1545239351-ef35f43d514b"),
    image("photo-1497366216548-37526070297c")
  ],
  general: [
    image("photo-1497366216548-37526070297c"),
    image("photo-1519389950473-47ba0277781c"),
    image("photo-1500530855697-b586d89ba3ee"),
    image("photo-1522202176988-66273c2fd55f"),
    image("photo-1460925895917-afdab827c52f")
  ]
};

const rules = [
  { pool: "video", pattern: /短视频|视频|抖音|快手|直播|影视|剪辑|搬运|带货|起号|涨粉|视频号/ },
  { pool: "ecommerce", pattern: /电商|带货|淘宝|天猫|淘宝客|拼多多|店群|闲鱼|二手|跨境|无货源|选品|购物|商品/ },
  { pool: "content", pattern: /自媒体|公众号|内容创作|写作|软文|小说|百家号|头条|文章|文案|矩阵/ },
  { pool: "risk", pattern: /灰产|黑产|骗局|风险|封禁|违规|割韭菜|敏感|争议|案例归档/ },
  { pool: "marketing", pattern: /引流|获客|搜索|推广|百度|问答|知乎|贴吧|豆瓣|微博|SEO|竞价|信息流|增长|加粉/ },
  { pool: "social", pattern: /社群|私域|微商|朋友圈|微信群|微信|裂变|个人品牌|新零售/ },
  { pool: "tools", pattern: /虚拟|资源|软件|工具|机器人|任务|平台|脚本|自动化/ },
  { pool: "local", pattern: /线下|实体|本地|门店|传统|小生意|三农|摆摊|餐饮|同城/ },
  { pool: "finance", pattern: /信息差|套利|资源整合|倒卖|变现|赚钱|收入|利润|副业|兼职/ },
  { pool: "web", pattern: /网站|站长|建站|SEO接单|产品运营|Cloudflare|GitHub|博客|前端|布局/ },
  { pool: "analysis", pattern: /商业案例|趋势|行业|分析|观察|市场|风口|判断/ },
  { pool: "education", pattern: /知识付费|课程|培训|咨询|教学|学习|训练营/ },
  { pool: "creative", pattern: /兴趣|技能|娱乐|音频|游戏|音乐|播客|剪辑/ },
  { pool: "design", pattern: /设计|视觉|动效|美学|UI|排版/ },
  { pool: "startup", pattern: /创业|认知|方法论|项目判断|项目挖掘|新手|小白|玩法/ }
];

const categoryPools = [
  { pool: "design", pattern: /设计/ },
  { pool: "web", pattern: /建站记录|网站站长|SEO接单|产品运营/ },
  { pool: "content", pattern: /自媒体|内容创作|公众号/ },
  { pool: "education", pattern: /知识付费|课程培训|咨询/ },
  { pool: "tools", pattern: /虚拟资源|软件工具|任务平台/ },
  { pool: "marketing", pattern: /引流获客|搜索推广/ },
  { pool: "finance", pattern: /信息差|套利|资源整合/ },
  { pool: "social", pattern: /社群私域|微商|裂变/ },
  { pool: "startup", pattern: /副业方法论|创业认知/ },
  { pool: "video", pattern: /短视频|直播|视频项目/ },
  { pool: "local", pattern: /线下实体|本地服务|传统小生意/ },
  { pool: "ecommerce", pattern: /电商|带货|店群平台/ },
  { pool: "creative", pattern: /兴趣技能|娱乐音频|游戏变现/ },
  { pool: "risk", pattern: /灰产骗局|风险案例/ },
  { pool: "analysis", pattern: /商业案例|趋势观察|行业分析/ },
  { pool: "general", pattern: /综合杂项|需人工复核/ }
];

function splitValues(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function choosePool(post) {
  const categories = splitValues(post.categories || post.category);
  const categoryText = categories.join(" ");
  const categoryMatch = categoryPools.find((rule) => rule.pattern.test(categoryText));
  if (categoryMatch) return categoryMatch.pool;
  const haystack = [
    post.title,
    categoryText,
    ...splitValues(post.subcategories || post.subcategory),
    ...splitValues(post.tags),
    post.summary
  ].join(" ");
  return rules.find((rule) => rule.pattern.test(haystack))?.pool || "general";
}

function chooseCover(post) {
  const poolName = choosePool(post);
  const pool = pools[poolName] || pools.general;
  const seed = [post.path, post.title, post.sourceNumber, post.subcategory].join("|");
  return pool[hashString(seed) % pool.length];
}

function markdownPathFromPost(post) {
  const relative = post.path.replace(/^\/+/, "");
  return path.join(root, "public", relative);
}

function updateMarkdownCover(filePath, cover) {
  const markdown = fs.readFileSync(filePath, "utf8");
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return false;
  const lines = match[1].split("\n");
  const coverIndex = lines.findIndex((line) => /^cover\s*:/.test(line));
  if (coverIndex >= 0) {
    lines[coverIndex] = `cover: ${cover}`;
  } else {
    const summaryIndex = lines.findIndex((line) => /^summary\s*:/.test(line));
    lines.splice(summaryIndex >= 0 ? summaryIndex : lines.length, 0, `cover: ${cover}`);
  }
  const updated = `---\n${lines.join("\n")}\n---\n\n${match[2].replace(/^\n/, "")}`;
  if (updated !== markdown) {
    fs.writeFileSync(filePath, updated, "utf8");
    return true;
  }
  return false;
}

const posts = JSON.parse(fs.readFileSync(indexPath, "utf8"));
let indexUpdates = 0;
let markdownUpdates = 0;

for (const post of posts) {
  const imported = post.path.includes("/money-playbook/");
  if (String(post.cover || "").trim() && !imported) continue;
  const cover = chooseCover(post);
  post.cover = cover;
  indexUpdates += 1;
  const filePath = markdownPathFromPost(post);
  if (fs.existsSync(filePath) && updateMarkdownCover(filePath, cover)) {
    markdownUpdates += 1;
  }
}

fs.writeFileSync(indexPath, `${JSON.stringify(posts, null, 2)}\n`, "utf8");

const covers = new Set(posts.map((post) => post.cover).filter(Boolean));
console.log(JSON.stringify({
  posts: posts.length,
  indexUpdates,
  markdownUpdates,
  covered: posts.filter((post) => String(post.cover || "").trim()).length,
  uniqueCovers: covers.size
}, null, 2));
