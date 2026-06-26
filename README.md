# My Blog

一个 Butterfly 风格的 Cloudflare Pages 博客第一版。

## 结构

- `public/`：前台静态网站、后台页面、文章和配置文件
- `functions/`：Cloudflare Pages Functions 后台 API
- `public/content/posts/`：Markdown 文章
- `public/content/pages/`：独立页面
- `public/config/`：站点、菜单、侧边栏和主题配置

## 本地运行

```bash
npm install
npm run dev
```

## Cloudflare 环境变量

在 Cloudflare Pages 项目中设置：

- `ADMIN_PASSWORD`：后台登录密码
- `SESSION_SECRET`：用于签名登录 cookie 的随机字符串
- `GITHUB_TOKEN`：有权限修改 `eteeng88988/my-blog` 的 GitHub token
- `GITHUB_OWNER`：默认 `eteeng88988`
- `GITHUB_REPO`：默认 `my-blog`
- `GITHUB_BRANCH`：默认 `main`

本地调试 Pages Functions 时，可以复制 `.dev.vars.example` 为 `.dev.vars`，再填入真实值。

## 后台地址

部署后访问：

```text
/admin/
```
