# My Blog

一个 Butterfly 风格的 Cloudflare Pages 博客。

## 结构

- `public/`：前台静态网站、后台页面、文章和配置文件
- `functions/`：Cloudflare Pages Functions 后台 API
- `public/content/posts/`：Markdown 文章
- `public/content/pages/`：独立页面
- `public/content/media.json`：媒体链接库
- `public/config/`：站点、菜单、侧边栏和主题配置
- `public/robots.txt`、`public/sitemap.xml`、`public/feed.xml`：SEO、站点地图和 RSS 文件
- `public/config/ads.json`：广告位配置
- `public/config/analytics.json`：本地统计和 Cloudflare Web Analytics 配置

## 本地运行

```bash
npm install
npm run dev
```

## 后台地址

```text
/admin/
```

后台保存文章、页面或站点地址后，会同步更新文章索引、RSS、站点地图和 robots 文件。首次绑定自定义域名后，请在后台“站点”里把“网站地址”改成正式域名。

## R2 内容存储

当前版本优先使用 R2 存储动态内容，绑定名为：

```text
BLOG_CONTENT
```

Cloudflare R2 bucket 名称为：

```text
my-blog-content
```

部署前请在 Cloudflare 创建同名 R2 bucket，或把 `wrangler.jsonc` 中的 `bucket_name` 改成你已有的 bucket 名称。后台登录后，可以在“仪表盘”点击“把当前静态内容同步到 R2”，把现有文章、页面、配置、RSS、Sitemap 等初始文件复制进 R2。

R2 未绑定时，前台仍会读取仓库里的静态文件；后台会尽量保留旧的 GitHub 写入能力。

## 广告位

后台“广告”使用结构化表单管理，不需要手写分隔符。每个广告位都可以单独设置：

- 打开或关闭。关闭后前台自动折叠，不占用页面空间。
- 展示页面：全站、首页、归档页、媒体页、文章内容页、独立页面。
- 展示范围：全部大类、指定大类、全部子类、指定子类、指定内容路径。
- 素材内容：标题、链接、图片、纯文字或 HTML。

支持的广告位：`global-top`、`home-top`、`category-top`、`subcategory-top`、`content-list`、`article-top`、`article-content`、`footer`。

## 批量内容导入

`tools/prepare-money-playbook-import.mjs` 会读取桌面文件夹里的分类目录 TXT 和原始正文 TXT，生成 `public/content/posts/money-playbook/` 下的草稿文章，并更新 `public/content/posts/index.json` 与 `public/config/categories.json`。

本次导入报告在 `outputs/money-playbook-import-report.md` 和 `outputs/money-playbook-import-report.json`。导入正文使用 `format: raw`，文章页会按原始换行显示。

## 访客统计

后台“统计”显示本地 R2 访问记录，包括近 14 天访问、今日访问、热门页面和热门类目。

后台“统计设置”可以开启或关闭本地 R2 统计，也可以填入 Cloudflare Web Analytics token。开启后，前台会自动加载 Cloudflare 官方统计脚本。

## 后台密码

后台密码不要写进 GitHub 代码。请在 Cloudflare Pages 项目环境变量里设置下面二选一：

- `ADMIN_PASSWORD`：后台登录明文密码，最简单。
- `ADMIN_PASSWORD_SHA256`：后台密码的 SHA-256 哈希，更安全。

如果两者都设置，任意一种匹配即可登录。如果两者都没有设置，后台会提示“后台密码未设置”。

本地调试时，复制 `.dev.vars.example` 为 `.dev.vars`，再填入真实值。`.dev.vars` 已被 `.gitignore` 忽略，不会提交到 GitHub。

## 环境变量

- `ADMIN_PASSWORD` 或 `ADMIN_PASSWORD_SHA256`
- `SESSION_SECRET`：用于签名登录 cookie 的随机字符串
- `GITHUB_TOKEN`：可选。仅在 R2 未绑定、需要使用旧 GitHub 写入回退时需要
- `GITHUB_OWNER`：可选，默认 `eteeng88988`
- `GITHUB_REPO`：可选，默认 `my-blog`
- `GITHUB_BRANCH`：可选，默认 `main`

## Cloudflare Pages 设置

- 项目名：`my-blog`
- 构建命令：留空
- 输出目录：`public`
- Functions 目录：`functions`
