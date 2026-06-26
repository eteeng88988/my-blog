# My Blog

一个 Butterfly 风格的 Cloudflare Pages 博客。

## 结构

- `public/`：前台静态网站、后台页面、文章和配置文件
- `functions/`：Cloudflare Pages Functions 后台 API
- `public/content/posts/`：Markdown 文章
- `public/content/pages/`：独立页面
- `public/content/media.json`：媒体链接库
- `public/config/`：站点、菜单、侧边栏和主题配置

## 本地运行

```bash
npm install
npm run dev
```

## 后台地址

```text
/admin/
```

## 后台密码

后台密码不要写进 GitHub 代码。请在 Cloudflare Pages 项目环境变量里设置下面二选一：

- `ADMIN_PASSWORD`：后台登录明文密码，最简单。
- `ADMIN_PASSWORD_SHA256`：后台密码的 SHA-256 哈希，更安全。

如果两者都设置，任意一种匹配即可登录。如果两者都没有设置，后台会提示“后台密码未设置”。

本地调试时，复制 `.dev.vars.example` 为 `.dev.vars`，再填入真实值。`.dev.vars` 已被 `.gitignore` 忽略，不会提交到 GitHub。

## 必需环境变量

- `ADMIN_PASSWORD` 或 `ADMIN_PASSWORD_SHA256`
- `SESSION_SECRET`：用于签名登录 cookie 的随机字符串
- `GITHUB_TOKEN`：有权限修改 `eteeng88988/my-blog` 的 GitHub token
- `GITHUB_OWNER`：默认 `eteeng88988`
- `GITHUB_REPO`：默认 `my-blog`
- `GITHUB_BRANCH`：默认 `main`

## Cloudflare Pages 设置

- 项目名：`my-blog`
- 构建命令：留空
- 输出目录：`public`
- Functions 目录：`functions`
