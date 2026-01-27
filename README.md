# CMD 锁定，自动后台开链接 - 一手吃东西不影响

> 一手吃东西，一手用鼠标，也能轻松后台打开链接！

## 功能介绍

这个小工具可以让你**无需按住 CMD 键**，点击链接自动在**后台打开新标签页**，当前页面保持不变。

### 核心功能

- 点击图标锁定/解锁 CMD 键
- 锁定后点击链接自动后台打开新标签页
- 图标可拖动到任意位置
- 右键菜单：按住 CMD / 松开 CMD / 关于
- 位置记忆功能

## 使用场景

| 场景 | 说明 |
|------|------|
| 一手吃东西 | 不用放下食物，单手操作 |
| 批量收藏链接 | 快速连续打开多个链接 |
| 懒人浏览 | 不想按键盘组合键 |

## 安装方法

### 1. 安装篡改猴扩展

首先安装浏览器扩展：

- Chrome: [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
- Firefox: [Tampermonkey](https://addons.mozilla.org/firefox/addon/tampermonkey/)
- Edge: [Tampermonkey](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)

### 2. 安装脚本

1. 点击篡改猴图标
2. 选择 **添加新脚本**
3. 复制 `cmd-lock-toggle.user.js` 内容
4. 粘贴到编辑器
5. 按 `Ctrl+S` (Mac: `Cmd+S`) 保存
6. 刷新网页即可使用

## 使用方法

### 基本操作

```
┌─────────────────────────────────────┐
│                                     │
│                    [🟢] ← 点击锁定  │
│       绿色 = 已锁定                   │
│       灰色 = 未锁定                   │
└─────────────────────────────────────┘
```

| 操作 | 效果 |
|------|------|
| **左键点击图标** | 切换锁定状态 |
| **拖动图标** | 移动到任意位置 |
| **右键图标** | 打开菜单 |

### 右键菜单

- **按住 CMD** - 锁定 CMD 键
- **松开 CMD** - 解锁 CMD 键
- **关于** - 查看版本信息

## 工作原理

锁定后，脚本会拦截链接点击事件，使用 `GM_openInTab` API 在后台打开新标签页，相当于 **Cmd+Shift+点击** 的效果。

## 常见问题

### Q: 为什么点击链接没反应？

A: 检查图标是否变为绿色（锁定状态），灰色表示未锁定。

### Q: 找不到按钮图标了怎么办？

A: 如果某些网站或页面找不到按钮图标，可能是之前保存的位置数据导致图标显示在屏幕外。可以执行以下步骤清除旧位置数据：

1. 按 `F12` 打开浏览器开发者工具
2. 切换到 **Console (控制台)** 标签
3. 运行以下命令：

```javascript
localStorage.removeItem('cmdLockPosition');
location.reload();
```

4. 页面会自动刷新，图标将恢复到默认位置

### Q: 支持哪些网站？

A: 所有网站（`@match *://*/*`）

## 技术栈

- Vanilla JavaScript
- Tampermonkey API
- LocalStorage

## 作者

**wlzh** - linuxdo 佬友

## 许可证

MIT License

## 更新日志

### v1.0.1 (2026-01-26)
- 优化标题描述
- 使用 GM_openInTab 实现后台打开

### v1.0.0
- 初始版本发布
