# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个 Tampermonkey 油猴脚本，让用户无需按住 CMD 键即可后台打开链接。核心文件只有一个：`cmd-lock-toggle.user.js`。

## 开发说明

无构建步骤，无依赖，无测试框架。直接编辑 `.user.js` 文件，在 Tampermonkey 中手动安装/更新测试。

### 安装测试

1. 打开 Tampermonkey → 添加新脚本
2. 粘贴 `cmd-lock-toggle.user.js` 内容保存
3. 刷新目标网页验证功能

## 架构

单文件 IIFE 结构，主要模块：

- **状态管理**：`cmdLocked`、`isDragging`、`hasMoved` 等变量控制锁定与拖动状态
- **持久化**：`localStorage` 存储按钮位置（key: `cmdLockPosition`）
- **UI 组件**：`cmdBtn`（主按钮）+ `contextMenu`（右键菜单）+ `<style>` 注入
- **事件流**：`mousedown/mousemove/mouseup` 区分点击与拖动（移动 >3px 视为拖动）；`contextmenu` 显示右键菜单；捕获阶段 `click` 拦截链接跳转
- **链接拦截**：使用 `GM_openInTab` API，`active: false` 实现后台打开

## 版本规范

每次修改必须同步更新：
1. 脚本头部 `@version` 字段
2. `README.md` 的更新日志（最新版本在最上方）
3. 关于对话框中的版本号（`alert(...)` 内的字符串）

版本号格式：`1.0.x`，当前为 `1.0.3`。

## 提交规范

使用中文提交信息，格式：`type: 描述`，例如：
- `feat: 新增右键菜单增加/减少按钮数量功能`
- `fix: 修复按钮消失问题`
- `docs: 更新 README 更新日志`
