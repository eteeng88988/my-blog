---
title: 第一篇文章：博客开始运行
date: 2026-06-26
showDate: true
category: 建站记录
subcategory: Cloudflare
tags: Cloudflare,GitHub,博客
cover: https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=80
summary: 这是一篇示例文章，用来验证前台文章列表、封面、分类、标签和 Markdown 渲染效果。
featured: true
---

这个博客的第一版采用 GitHub + Cloudflare Pages 的方式。

内容文件放在 GitHub 仓库里，后台保存时会通过 Cloudflare Pages Functions 调用 GitHub API 修改仓库文件。GitHub 有变更后，Cloudflare Pages 会重新部署，前台自然更新。

后续可以继续增加图片库、评论、搜索、主题配置和多管理员功能。
