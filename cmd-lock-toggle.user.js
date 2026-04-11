// ==UserScript==
// @name         CMD 锁定，自动后台开链接 - 一手吃东西不影响
// @namespace    http://tampermonkey.net/
// @version      1.0.8
// @description  左下角图标点击锁定/解锁，自动后台打开新标签页，无需按住 CMD 键。作者：wlzh
// @author       wlzh
// @match        *://*/*
// @grant        GM_openInTab
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 配置常量
    const DEFAULT_SIZE = 22;
    const SIZE_MIN = DEFAULT_SIZE * 0.3;   // 6.6px - 默认值的 30%
    const SIZE_MAX = DEFAULT_SIZE * 5;     // 110px - 默认值的 5 倍
    const RECT_WIDTH_RATIO = 1.6;          // 长方形宽高比
    const MAX_BTN_COUNT = 20;
    const DRAG_THRESHOLD = 3;
    const HANDLE_SIZE = 8;

    // 全局状态
    let btnSize = DEFAULT_SIZE;
    let btnShape = 'circle';
    let addCount = 3;
    let resizePercent = 20;
    let buttons = [];
    let activeBtnIndex = -1;

    // 水印模式状态
    let watermarkMode = false;
    let watermarkText = '';
    let watermarkWidth = 200;
    let watermarkHeight = 60;
    let watermarkOpacity = 30;             // 透明度百分比，默认 30%

    // 计算按钮实际尺寸
    function getBtnWidth() {
        if (watermarkMode) return watermarkWidth;
        return Math.round(btnShape === 'rectangle' ? btnSize * RECT_WIDTH_RATIO : btnSize);
    }
    function getBtnHeight() {
        if (watermarkMode) return watermarkHeight;
        return Math.round(btnSize);
    }

    // 从 localStorage 恢复设置
    const savedSize = localStorage.getItem('cmdLockBtnSize');
    if (savedSize) { const s = parseFloat(savedSize); if (s >= SIZE_MIN && s <= SIZE_MAX) btnSize = s; }

    const savedShape = localStorage.getItem('cmdLockBtnShape');
    if (savedShape && ['circle', 'square', 'rectangle'].includes(savedShape)) btnShape = savedShape;

    const savedAddCount = localStorage.getItem('cmdLockAddCount');
    if (savedAddCount) { const c = parseInt(savedAddCount); if (c >= 1 && c <= 10) addCount = c; }

    const savedPercent = localStorage.getItem('cmdLockResizePercent');
    if (savedPercent) { const p = parseInt(savedPercent); if (p >= 1 && p <= 100) resizePercent = p; }

    // 恢复水印状态
    const savedWatermark = localStorage.getItem('cmdLockWatermark');
    if (savedWatermark) {
        try {
            const wm = JSON.parse(savedWatermark);
            if (wm.text) watermarkText = wm.text;
            if (wm.width >= 40) watermarkWidth = wm.width;
            if (wm.height >= 20) watermarkHeight = wm.height;
            if (wm.opacity >= 5 && wm.opacity <= 100) watermarkOpacity = wm.opacity;
            if (wm.active) watermarkMode = true;
        } catch (e) {}
    }

    // 从 localStorage 恢复按钮状态
    let buttonStates = [{ x: 20, y: window.innerHeight - 70, locked: false }];
    const savedButtons = localStorage.getItem('cmdLockButtons');
    if (savedButtons) {
        try {
            const parsed = JSON.parse(savedButtons);
            if (Array.isArray(parsed) && parsed.length > 0) buttonStates = parsed;
        } catch (e) {
            console.log('CMD 锁定: 读取按钮状态失败', e);
        }
    }

    // 兼容旧版
    if (!savedButtons) {
        const savedPos = localStorage.getItem('cmdLockPosition');
        if (savedPos) {
            try {
                const parsed = JSON.parse(savedPos);
                const bw = getBtnWidth(), bh = getBtnHeight();
                if (parsed.x >= 0 && parsed.x <= window.innerWidth - bw && parsed.y >= 0 && parsed.y <= window.innerHeight - bh) {
                    buttonStates[0] = { x: parsed.x, y: parsed.y, locked: false };
                }
            } catch (e) {}
        }
    }

    // 验证按钮位置
    buttonStates.forEach((state, i) => {
        const bw = getBtnWidth(), bh = getBtnHeight();
        if (state.x < 0 || state.x > window.innerWidth - bw || state.y < 0 || state.y > window.innerHeight - bh) {
            state.x = 20 + i * (bw + 10);
            state.y = Math.max(20, window.innerHeight - 70);
        }
    });

    // 创建菜单容器
    const contextMenu = document.createElement('div');
    contextMenu.id = 'cmd-lock-menu';

    // 菜单样式
    Object.assign(contextMenu.style, {
        position: 'fixed', display: 'none', backgroundColor: '#2c2c2c',
        border: '1px solid #444', borderRadius: '8px', padding: '2px 0',
        minWidth: '180px', zIndex: '999999',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)', fontSize: '13px',
    });

    // 注入 CSS
    const style = document.createElement('style');
    style.textContent = `
        #cmd-lock-menu .menu-item {
            padding: 6px 14px; cursor: pointer; display: flex; align-items: center;
            gap: 8px; color: #e0e0e0; transition: background-color 0.15s;
        }
        #cmd-lock-menu .menu-item:hover { background-color: #4a4a4a; }
        #cmd-lock-menu .menu-item svg { flex-shrink: 0; }
        #cmd-lock-menu .menu-divider { height: 1px; background-color: #444; margin: 2px 0; }
        #cmd-lock-menu .menu-check { width: 14px; text-align: center; flex-shrink: 0; }
        #cmd-lock-menu .menu-setting { color: #999; font-size: 11px; }
        .cmd-lock-btn-instance {
            position: fixed; cursor: move; z-index: 999999; display: flex;
            align-items: center; justify-content: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            transition: background-color 0.3s, transform 0.1s, width 0.2s, height 0.2s, border-radius 0.2s;
            user-select: none;
        }
        .cmd-lock-btn-instance:hover { transform: scale(1.1); }
        .cmd-lock-btn-instance:active { transform: scale(0.95); }
        .cmd-lock-btn-instance.locked { box-shadow: 0 0 15px rgba(76, 175, 80, 0.6); }
        .cmd-lock-btn-instance.watermark-mode {
            background: none !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            overflow: hidden;
        }
        .cmd-lock-btn-instance.watermark-mode:hover { transform: none; }
        .cmd-lock-btn-instance.watermark-mode:active { transform: none; }
        .cmd-lock-btn-instance.watermark-mode.locked { box-shadow: none !important; }
        .watermark-text {
            width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
            word-break: break-all; white-space: pre-wrap; text-align: center;
            pointer-events: none; padding: 4px;
            font-size: 12px; line-height: 1.4; overflow: hidden;
        }
        .resize-handle {
            position: absolute; width: ${HANDLE_SIZE}px; height: ${HANDLE_SIZE}px;
            background: rgba(0,0,0,0.15); border-radius: 2px; z-index: 10;
        }
        .resize-handle.rb { right: 0; bottom: 0; cursor: nwse-resize; }
        .resize-handle.rt { right: 0; top: 0; cursor: nesw-resize; }
        .resize-handle.lb { left: 0; bottom: 0; cursor: nesw-resize; }
        .resize-handle.lt { left: 0; top: 0; cursor: nwse-resize; }
    `;
    document.head.appendChild(style);

    // 渲染菜单
    function renderMenu() {
        const shapes = [
            { value: 'circle', label: '圆形' },
            { value: 'square', label: '正方形' },
            { value: 'rectangle', label: '长方形' },
        ];
        const shapeHTML = shapes.map(s => {
            const prefix = s.value === btnShape ? '✓' : '';
            return `<div class="menu-item" data-action="shape" data-shape="${s.value}">
                <span class="menu-check">${prefix}</span>${s.label}
            </div>`;
        }).join('');

        // 水印模式菜单项
        let watermarkHTML = '';
        if (watermarkMode) {
            watermarkHTML = `
                <div class="menu-item" data-action="exitWatermark">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>
                    </svg>
                    退出水印模式
                </div>
                <div class="menu-item" data-action="setWatermarkText">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M4 7V4h16v3"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>
                    </svg>
                    设置水印文字
                </div>
                <div class="menu-item" data-action="setWatermarkOpacity">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="9"/><path d="M12 3v18" stroke-dasharray="3 3"/>
                    </svg>
                    设置透明度 <span class="menu-setting">${watermarkOpacity}%</span>
                </div>
            `;
        } else {
            watermarkHTML = `
                <div class="menu-item" data-action="enterWatermark">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M4 7V4h16v3"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>
                    </svg>
                    进入水印模式
                </div>
                <div class="menu-item" data-action="setWatermarkText">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M4 7V4h16v3"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>
                    </svg>
                    设置水印文字
                </div>
            `;
        }

        contextMenu.innerHTML = `
            <div class="menu-item" data-action="lock">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                按住 CMD
            </div>
            <div class="menu-item" data-action="unlock">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                </svg>
                松开 CMD
            </div>
            <div class="menu-divider"></div>
            <div class="menu-item" data-action="addBtn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                </svg>
                增加按钮 <span class="menu-setting">×${addCount}</span>
            </div>
            <div class="menu-item" data-action="removeBtn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="12" x2="16" y2="12"/>
                </svg>
                减少按钮 <span class="menu-setting">×${addCount}</span>
            </div>
            <div class="menu-item" data-action="setCount">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="9"/><text x="12" y="16" text-anchor="middle" fill="currentColor" font-size="12" stroke="none">N</text>
                </svg>
                设置增减数量
            </div>
            <div class="menu-divider"></div>
            <div class="menu-item" data-action="enlarge">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="7"/><line x1="16" y1="16" x2="21" y2="21"/>
                    <line x1="8" y1="11" x2="14" y2="11"/><line x1="11" y1="8" x2="11" y2="14"/>
                </svg>
                放大按钮 <span class="menu-setting">+${resizePercent}%</span>
            </div>
            <div class="menu-item" data-action="shrink">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="7"/><line x1="16" y1="16" x2="21" y2="21"/>
                    <line x1="8" y1="11" x2="14" y2="11"/>
                </svg>
                缩小按钮 <span class="menu-setting">-${resizePercent}%</span>
            </div>
            <div class="menu-item" data-action="setPercent">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="9"/><text x="12" y="16" text-anchor="middle" fill="currentColor" font-size="11" stroke="none">%</text>
                </svg>
                设置缩放比例
            </div>
            <div class="menu-divider"></div>
            ${shapeHTML}
            <div class="menu-divider"></div>
            ${watermarkHTML}
            <div class="menu-divider"></div>
            <div class="menu-item" data-action="about">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="10"/><text x="12" y="16" text-anchor="middle" fill="white" font-size="12" font-weight="bold">?</text>
                </svg>
                关于
            </div>
        `;
    }

    renderMenu();

    // ==================== 水印模式 ====================

    // 应用水印样式到单个按钮
    function applyWatermarkStyle(btn, locked) {
        btn.classList.add('watermark-mode');
        btn.classList.remove('locked');
        btn.style.width = watermarkWidth + 'px';
        btn.style.height = watermarkHeight + 'px';
        btn.style.borderRadius = '0';
        btn.style.backgroundColor = 'transparent';

        // 字体大小基于较小维度
        const fontSize = Math.max(10, Math.round(Math.min(watermarkWidth, watermarkHeight) * 0.15));
        // 透明度只影响文字颜色，背景完全透明
        const color = locked ? `rgba(76, 175, 80, ${watermarkOpacity / 100})` : `rgba(0, 0, 0, ${watermarkOpacity / 100})`;
        btn.innerHTML = `<span class="watermark-text" style="font-size:${fontSize}px; color:${color}">${watermarkText}</span>`;

        // 添加 resize 手柄
        ['rb', 'rt', 'lb', 'lt'].forEach(pos => {
            const handle = document.createElement('div');
            handle.className = `resize-handle ${pos}`;
            handle.dataset.handle = pos;
            btn.appendChild(handle);
        });
    }

    // 移除水印样式
    function removeWatermarkStyle(btn) {
        btn.classList.remove('watermark-mode');
    }

    // 进入水印模式
    function enterWatermarkMode() {
        if (!watermarkText) {
            const input = prompt('请输入水印文字：', watermarkText || '水印');
            if (input === null || input.trim() === '') return;
            watermarkText = input.trim();
        }
        watermarkMode = true;

        buttons.forEach(b => {
            applyWatermarkStyle(b.el, b.locked);
            // 确保不超出窗口
            const rect = b.el.getBoundingClientRect();
            let x = rect.left, y = rect.top;
            if (x > window.innerWidth - watermarkWidth) x = window.innerWidth - watermarkWidth;
            if (y > window.innerHeight - watermarkHeight) y = window.innerHeight - watermarkHeight;
            if (x < 0) x = 0;
            if (y < 0) y = 0;
            b.el.style.left = x + 'px';
            b.el.style.top = y + 'px';
        });

        saveState();
        renderMenu();
    }

    // 退出水印模式
    function exitWatermarkMode() {
        watermarkMode = false;

        buttons.forEach(b => {
            removeWatermarkStyle(b.el);
            applyShapeStyle(b.el);
            updateButtonAppearance(b.el, b.locked);
            if (b.locked) b.el.classList.add('locked');
            // 确保不超出窗口
            const rect = b.el.getBoundingClientRect();
            const bw = getBtnWidth(), bh = getBtnHeight();
            let x = rect.left, y = rect.top;
            if (x > window.innerWidth - bw) x = window.innerWidth - bw;
            if (y > window.innerHeight - bh) y = window.innerHeight - bh;
            if (x < 0) x = 0;
            if (y < 0) y = 0;
            b.el.style.left = x + 'px';
            b.el.style.top = y + 'px';
        });

        saveState();
        renderMenu();
    }

    // 设置水印文字
    function setWatermarkText() {
        const input = prompt('设置水印文字：', watermarkText);
        if (input === null) return;
        if (input.trim() === '') return;
        watermarkText = input.trim();

        if (watermarkMode) {
            buttons.forEach(b => {
                const textEl = b.el.querySelector('.watermark-text');
                if (textEl) textEl.textContent = watermarkText;
            });
        }
        saveState();
    }

    // 设置水印透明度
    function setWatermarkOpacity() {
        const input = prompt('设置水印透明度（5-100）：', watermarkOpacity.toString());
        if (input === null) return;
        const val = parseInt(input);
        if (isNaN(val) || val < 5 || val > 100) return;
        watermarkOpacity = val;

        if (watermarkMode) {
            buttons.forEach(b => {
                const textEl = b.el.querySelector('.watermark-text');
                if (textEl) {
                    const color = b.locked ? `rgba(76, 175, 80, ${watermarkOpacity / 100})` : `rgba(0, 0, 0, ${watermarkOpacity / 100})`;
                    textEl.style.color = color;
                }
            });
        }
        saveState();
        renderMenu();
    }

    // ==================== 按钮基础功能 ====================

    // 更新按钮图标
    function updateButtonAppearance(btn, locked) {
        const svgSize = Math.round(Math.min(getBtnWidth(), getBtnHeight()) * 0.55);
        btn.innerHTML = `
            <svg width="${svgSize}" height="${svgSize}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="4" width="20" height="16" rx="2" stroke="white" stroke-width="2" fill="${locked ? '#4CAF50' : '#666'}"/>
                <path d="M7 10h10M7 14h6" stroke="white" stroke-width="2" stroke-linecap="round"/>
            </svg>
        `;
    }

    // 应用形状和尺寸样式
    function applyShapeStyle(btn) {
        btn.style.width = getBtnWidth() + 'px';
        btn.style.height = getBtnHeight() + 'px';
        btn.style.borderRadius = btnShape === 'circle' ? '50%' : '8px';
    }

    // 创建按钮
    function createButton(state, index) {
        const btn = document.createElement('div');
        btn.className = 'cmd-lock-btn-instance';

        Object.assign(btn.style, {
            left: state.x + 'px',
            top: state.y + 'px',
            backgroundColor: state.locked ? '#4CAF50' : '#666',
        });

        if (watermarkMode) {
            applyWatermarkStyle(btn, state.locked);
        } else {
            applyShapeStyle(btn);
            updateButtonAppearance(btn, state.locked);
            if (state.locked) btn.classList.add('locked');
        }

        // 左键：拖动 / resize handle
        btn.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;

            // 检查是否点击了 resize handle
            const handle = e.target.closest('.resize-handle');
            if (handle && watermarkMode) {
                const b = buttons[index];
                b.isResizing = true;
                b.resizeHandle = handle.dataset.handle;
                b.resizeStartX = e.clientX;
                b.resizeStartY = e.clientY;
                b.resizeStartW = watermarkWidth;
                b.resizeStartH = watermarkHeight;
                e.preventDefault();
                return;
            }

            // 普通拖动
            const b = buttons[index];
            b.isDragging = true;
            b.hasMoved = false;
            b.startX = e.clientX;
            b.startY = e.clientY;
            const rect = btn.getBoundingClientRect();
            b.dragOffsetX = e.clientX - rect.left;
            b.dragOffsetY = e.clientY - rect.top;
            btn.style.cursor = 'grabbing';
            e.preventDefault();
        });

        // 右键菜单
        btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            activeBtnIndex = index;
            showMenu(e.clientX, e.clientY);
        });

        return btn;
    }

    // 初始化所有按钮
    function initButtons() {
        buttons.forEach(b => { if (b.el && b.el.parentNode) b.el.parentNode.removeChild(b.el); });
        buttons = [];

        buttonStates.forEach((state, i) => {
            const btn = createButton(state, i);
            document.body.appendChild(btn);
            buttons.push({
                el: btn, locked: state.locked,
                isDragging: false, hasMoved: false,
                startX: 0, startY: 0, dragOffsetX: 0, dragOffsetY: 0,
                isResizing: false, resizeHandle: '', resizeStartX: 0, resizeStartY: 0, resizeStartW: 0, resizeStartH: 0,
            });
        });
    }

    // 保存所有状态
    function saveState() {
        buttonStates = buttons.map(b => {
            const rect = b.el.getBoundingClientRect();
            return { x: rect.left, y: rect.top, locked: b.locked };
        });
        localStorage.setItem('cmdLockButtons', JSON.stringify(buttonStates));
        localStorage.setItem('cmdLockBtnSize', btnSize.toString());
        localStorage.setItem('cmdLockBtnShape', btnShape);
        localStorage.setItem('cmdLockAddCount', addCount.toString());
        localStorage.setItem('cmdLockResizePercent', resizePercent.toString());
        localStorage.setItem('cmdLockWatermark', JSON.stringify({
            active: watermarkMode,
            text: watermarkText,
            width: watermarkWidth,
            height: watermarkHeight,
            opacity: watermarkOpacity,
        }));
    }

    // 更新按钮锁定状态
    function updateBtnState(index, locked) {
        buttons[index].locked = locked;
        const btn = buttons[index].el;

        if (watermarkMode) {
            // 水印模式：只改文字颜色
            const textEl = btn.querySelector('.watermark-text');
            if (textEl) {
                const color = locked ? `rgba(76, 175, 80, ${watermarkOpacity / 100})` : `rgba(0, 0, 0, ${watermarkOpacity / 100})`;
                textEl.style.color = color;
            }
        } else {
            if (locked) {
                btn.classList.add('locked');
                btn.style.backgroundColor = '#4CAF50';
            } else {
                btn.classList.remove('locked');
                btn.style.backgroundColor = '#666';
            }
            updateButtonAppearance(btn, locked);
        }
        saveState();
    }

    // 显示菜单
    function showMenu(x, y) {
        contextMenu.style.left = x + 'px';
        contextMenu.style.top = y + 'px';
        contextMenu.style.display = 'block';
        const menuRect = contextMenu.getBoundingClientRect();
        if (menuRect.right > window.innerWidth) contextMenu.style.left = (x - menuRect.width) + 'px';
        if (menuRect.bottom > window.innerHeight) contextMenu.style.top = (y - menuRect.height) + 'px';
    }

    function hideMenu() { contextMenu.style.display = 'none'; }

    // 全局鼠标移动：拖动 + resize
    document.addEventListener('mousemove', (e) => {
        buttons.forEach((b) => {
            // resize handle 拖动
            if (b.isResizing) {
                const dx = e.clientX - b.resizeStartX;
                const dy = e.clientY - b.resizeStartY;
                let newW = b.resizeStartW;
                let newH = b.resizeStartH;

                // 根据手柄方向计算新尺寸
                const h = b.resizeHandle;
                if (h === 'rb') { newW += dx; newH += dy; }
                else if (h === 'rt') { newW += dx; newH -= dy; }
                else if (h === 'lb') { newW -= dx; newH += dy; }
                else if (h === 'lt') { newW -= dx; newH -= dy; }

                // 最小尺寸
                newW = Math.max(40, Math.round(newW));
                newH = Math.max(20, Math.round(newH));

                // 更新全局尺寸并同步所有按钮
                watermarkWidth = newW;
                watermarkHeight = newH;
                buttons.forEach(bb => {
                    bb.el.style.width = newW + 'px';
                    bb.el.style.height = newH + 'px';
                    const textEl = bb.el.querySelector('.watermark-text');
                    if (textEl) {
                        textEl.style.fontSize = Math.max(10, Math.round(Math.min(newW, newH) * 0.15)) + 'px';
                        const color = bb.locked ? `rgba(76, 175, 80, ${watermarkOpacity / 100})` : `rgba(0, 0, 0, ${watermarkOpacity / 100})`;
                        textEl.style.color = color;
                    }
                });
                return;
            }

            // 普通拖动
            if (!b.isDragging) return;
            if (!b.hasMoved) {
                const dist = Math.sqrt(Math.pow(e.clientX - b.startX, 2) + Math.pow(e.clientY - b.startY, 2));
                if (dist > DRAG_THRESHOLD) b.hasMoved = true;
            }

            const bw = getBtnWidth(), bh = getBtnHeight();
            let newX = Math.max(0, Math.min(e.clientX - b.dragOffsetX, window.innerWidth - bw));
            let newY = Math.max(0, Math.min(e.clientY - b.dragOffsetY, window.innerHeight - bh));
            b.el.style.left = newX + 'px';
            b.el.style.top = newY + 'px';
        });
    });

    // 全局松开
    document.addEventListener('mouseup', () => {
        buttons.forEach((b, i) => {
            if (b.isResizing) {
                b.isResizing = false;
                buttons.forEach(bb => {
                    const rect = bb.el.getBoundingClientRect();
                    let x = rect.left, y = rect.top;
                    if (x > window.innerWidth - watermarkWidth) x = window.innerWidth - watermarkWidth;
                    if (y > window.innerHeight - watermarkHeight) y = window.innerHeight - watermarkHeight;
                    if (x < 0) x = 0; if (y < 0) y = 0;
                    bb.el.style.left = x + 'px';
                    bb.el.style.top = y + 'px';
                });
                saveState();
                return;
            }
            if (!b.isDragging) return;
            b.isDragging = false;
            b.el.style.cursor = 'move';
            // 水印模式和普通模式：点击都切换锁定状态
            if (!b.hasMoved) updateBtnState(i, !b.locked);
            else saveState();
        });
    });

    // 点击其他地方关闭菜单
    document.addEventListener('click', (e) => {
        if (!contextMenu.contains(e.target) && !e.target.closest('.cmd-lock-btn-instance')) {
            hideMenu();
        }
    });

    // ==================== 按钮增减和缩放 ====================

    function addButtons() {
        for (let n = 0; n < addCount; n++) {
            if (buttons.length >= MAX_BTN_COUNT) break;
            const lastBtn = buttons[buttons.length - 1];
            const rect = lastBtn.el.getBoundingClientRect();
            const bw = getBtnWidth(), bh = getBtnHeight();
            let newX = rect.left + bw + 10;
            let newY = rect.top;
            if (newX > window.innerWidth - bw) {
                newX = 20;
                newY = rect.top - bh - 10;
                if (newY < 0) newY = Math.max(20, window.innerHeight - 70);
            }
            const state = { x: newX, y: newY, locked: false };
            buttonStates.push(state);
            const index = buttons.length;
            const btn = createButton(state, index);
            document.body.appendChild(btn);
            buttons.push({
                el: btn, locked: false, isDragging: false, hasMoved: false,
                startX: 0, startY: 0, dragOffsetX: 0, dragOffsetY: 0,
                isResizing: false, resizeHandle: '', resizeStartX: 0, resizeStartY: 0, resizeStartW: 0, resizeStartH: 0,
            });
        }
        saveState();
    }

    function removeButtons() {
        for (let n = 0; n < addCount; n++) {
            if (buttons.length <= 1) break;
            const last = buttons.pop();
            if (last.el.parentNode) last.el.parentNode.removeChild(last.el);
            buttonStates.pop();
        }
        saveState();
    }

    function enlargeButtons() {
        const newSize = btnSize * (1 + resizePercent / 100);
        if (newSize > SIZE_MAX) return;
        btnSize = Math.round(newSize);
        buttons.forEach(b => {
            applyShapeStyle(b.el);
            updateButtonAppearance(b.el, b.locked);
            const rect = b.el.getBoundingClientRect();
            const bw = getBtnWidth(), bh = getBtnHeight();
            let x = Math.min(rect.left, window.innerWidth - bw);
            let y = Math.min(rect.top, window.innerHeight - bh);
            if (x < 0) x = 0; if (y < 0) y = 0;
            b.el.style.left = x + 'px';
            b.el.style.top = y + 'px';
        });
        saveState();
    }

    function shrinkButtons() {
        const newSize = btnSize * (1 - resizePercent / 100);
        if (newSize < SIZE_MIN) return;
        btnSize = Math.round(newSize);
        buttons.forEach(b => {
            applyShapeStyle(b.el);
            updateButtonAppearance(b.el, b.locked);
        });
        saveState();
    }

    function changeShape(shape) {
        if (!['circle', 'square', 'rectangle'].includes(shape)) return;
        btnShape = shape;
        buttons.forEach(b => {
            applyShapeStyle(b.el);
            updateButtonAppearance(b.el, b.locked);
            const rect = b.el.getBoundingClientRect();
            const bw = getBtnWidth(), bh = getBtnHeight();
            let x = rect.left, y = rect.top;
            if (x > window.innerWidth - bw) x = window.innerWidth - bw;
            if (y > window.innerHeight - bh) y = window.innerHeight - bh;
            if (x < 0) x = 0; if (y < 0) y = 0;
            b.el.style.left = x + 'px';
            b.el.style.top = y + 'px';
        });
        saveState();
        renderMenu();
    }

    // ==================== 菜单点击 ====================

    contextMenu.addEventListener('click', (e) => {
        const item = e.target.closest('.menu-item');
        if (!item) return;

        const action = item.dataset.action;
        switch (action) {
            case 'lock':
                if (activeBtnIndex >= 0) updateBtnState(activeBtnIndex, true);
                break;
            case 'unlock':
                if (activeBtnIndex >= 0) updateBtnState(activeBtnIndex, false);
                break;
            case 'addBtn': addButtons(); break;
            case 'removeBtn': removeButtons(); break;
            case 'setCount': {
                const input = prompt('设置增减按钮数量（1-10）：', addCount.toString());
                if (input !== null) {
                    const c = parseInt(input);
                    if (c >= 1 && c <= 10) { addCount = c; localStorage.setItem('cmdLockAddCount', addCount.toString()); renderMenu(); }
                }
                break;
            }
            case 'enlarge': enlargeButtons(); break;
            case 'shrink': shrinkButtons(); break;
            case 'setPercent': {
                const input = prompt('设置缩放比例（1-100%）：', resizePercent.toString());
                if (input !== null) {
                    const p = parseInt(input);
                    if (p >= 1 && p <= 100) { resizePercent = p; localStorage.setItem('cmdLockResizePercent', resizePercent.toString()); renderMenu(); }
                }
                break;
            }
            case 'shape': changeShape(item.dataset.shape); break;
            case 'enterWatermark': enterWatermarkMode(); break;
            case 'exitWatermark': exitWatermarkMode(); break;
            case 'setWatermarkText': setWatermarkText(); break;
            case 'setWatermarkOpacity': setWatermarkOpacity(); break;
            case 'about':
                alert('CMD 锁定切换 v1.0.8\n\n作者：wlzh\n\n一手吃东西，一手用鼠标，也能轻松新标签页打开链接！\n\n功能：\n- 点击图标锁定/解锁 CMD 键\n- 可拖动位置，支持多个按钮\n- 右键增减按钮（可设数量）\n- 按百分比放大/缩小（可设比例）\n- 支持圆形/正方形/长方形切换\n- 水印模式：纯文字水印，可设文字和透明度');
                break;
        }
        hideMenu();
    });

    // ==================== 链接拦截 ====================

    document.addEventListener('click', (e) => {
        if (!buttons.some(b => b.locked)) return;
        let target = e.target;
        while (target && target.tagName !== 'A') {
            target = target.parentElement;
            if (target === document.documentElement) { target = null; break; }
        }
        if (target && target.tagName === 'A' && target.href) {
            if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                GM_openInTab(target.href, { active: false, insert: true, setParent: true });
            }
        }
    }, true);

    // ==================== 可见性保障 ====================

    function ensureButtonsVisible() {
        buttons.forEach((b, i) => {
            const rect = b.el.getBoundingClientRect();
            const bw = getBtnWidth(), bh = getBtnHeight();
            let needsUpdate = false, newX = rect.left, newY = rect.top;

            if (rect.right <= 0 || rect.left >= window.innerWidth || rect.bottom <= 0 || rect.top >= window.innerHeight) {
                newX = 20 + i * (bw + 10); newY = Math.max(20, window.innerHeight - 70); needsUpdate = true;
            } else {
                if (rect.right > window.innerWidth) { newX = window.innerWidth - bw; needsUpdate = true; }
                if (rect.bottom > window.innerHeight) { newY = window.innerHeight - bh; needsUpdate = true; }
                if (rect.left < 0) { newX = 0; needsUpdate = true; }
                if (rect.top < 0) { newY = 0; needsUpdate = true; }
            }

            if (needsUpdate) { b.el.style.left = newX + 'px'; b.el.style.top = newY + 'px'; }
            b.el.style.display = 'flex';
            b.el.style.visibility = 'visible';
            b.el.style.opacity = '1';
        });
    }

    // ==================== 初始化 ====================

    document.body.appendChild(contextMenu);
    initButtons();
    ensureButtonsVisible();

    window.addEventListener('resize', () => { ensureButtonsVisible(); });

    setInterval(() => {
        buttons.forEach(b => {
            const rect = b.el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
                console.log('CMD 锁定: 检测到按钮被隐藏，恢复显示');
                ensureButtonsVisible();
            }
        });
    }, 5000);

    console.log('CMD 锁定切换脚本已加载 v1.0.8 - 作者：wlzh');
})();
