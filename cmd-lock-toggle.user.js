// ==UserScript==
// @name         CMD 锁定，自动后台开链接 - 一手吃东西不影响
// @namespace    http://tampermonkey.net/
// @version      1.0.4
// @description  左下角图标点击锁定/解锁，自动后台打开新标签页，无需按住 CMD 键。作者：wlzh
// @author       wlzh
// @match        *://*/*
// @grant        GM_openInTab
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 配置常量
    const MIN_BTN_SIZE = 30;
    const MAX_BTN_SIZE = 80;
    const SIZE_STEP = 6;
    const MAX_BTN_COUNT = 6;
    const DRAG_THRESHOLD = 3;

    // 全局状态
    let btnSize = 44;
    let buttons = []; // {el, locked, isDragging, hasMoved, startX, startY, dragOffsetX, dragOffsetY}
    let activeBtnIndex = -1; // 当前右键操作的按钮索引

    // 从 localStorage 恢复按钮大小
    const savedSize = localStorage.getItem('cmdLockBtnSize');
    if (savedSize) {
        const s = parseInt(savedSize);
        if (s >= MIN_BTN_SIZE && s <= MAX_BTN_SIZE) btnSize = s;
    }

    // 从 localStorage 恢复按钮状态
    let buttonStates = [{ x: 20, y: window.innerHeight - 70, locked: false }];
    const savedButtons = localStorage.getItem('cmdLockButtons');
    if (savedButtons) {
        try {
            const parsed = JSON.parse(savedButtons);
            if (Array.isArray(parsed) && parsed.length > 0) {
                buttonStates = parsed;
            }
        } catch (e) {
            console.log('CMD 锁定: 读取按钮状态失败', e);
        }
    }

    // 兼容旧版单按钮位置数据
    if (!savedButtons) {
        const savedPos = localStorage.getItem('cmdLockPosition');
        if (savedPos) {
            try {
                const parsed = JSON.parse(savedPos);
                const maxX = window.innerWidth - btnSize;
                const maxY = window.innerHeight - btnSize;
                if (parsed.x >= 0 && parsed.x <= maxX && parsed.y >= 0 && parsed.y <= maxY) {
                    buttonStates[0] = { x: parsed.x, y: parsed.y, locked: false };
                }
            } catch (e) {
                console.log('CMD 锁定: 读取旧版位置失败', e);
            }
        }
    }

    // 验证按钮位置是否在可视区域内
    buttonStates.forEach((state, i) => {
        const maxX = window.innerWidth - btnSize;
        const maxY = window.innerHeight - btnSize;
        if (state.x < 0 || state.x > maxX || state.y < 0 || state.y > maxY) {
            if (i === 0) {
                state.x = 20;
                state.y = window.innerHeight - 70;
            } else {
                state.x = 20 + i * (btnSize + 10);
                state.y = window.innerHeight - 70;
            }
        }
    });

    // 创建右键菜单
    const contextMenu = document.createElement('div');
    contextMenu.id = 'cmd-lock-menu';
    contextMenu.innerHTML = `
        <div class="menu-item" data-action="lock">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            按住 CMD
        </div>
        <div class="menu-item" data-action="unlock">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
            </svg>
            松开 CMD
        </div>
        <div class="menu-divider"></div>
        <div class="menu-item" data-action="addBtn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="12" y1="8" x2="12" y2="16"/>
                <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
            增加按钮
        </div>
        <div class="menu-item" data-action="removeBtn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
            减少按钮
        </div>
        <div class="menu-divider"></div>
        <div class="menu-item" data-action="enlarge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="7"/>
                <line x1="16" y1="16" x2="21" y2="21"/>
                <line x1="8" y1="11" x2="14" y2="11"/>
                <line x1="11" y1="8" x2="11" y2="14"/>
            </svg>
            放大按钮
        </div>
        <div class="menu-item" data-action="shrink">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="7"/>
                <line x1="16" y1="16" x2="21" y2="21"/>
                <line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
            缩小按钮
        </div>
        <div class="menu-divider"></div>
        <div class="menu-item" data-action="about">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="10"/>
                <text x="12" y="16" text-anchor="middle" fill="white" font-size="12" font-weight="bold">?</text>
            </svg>
            关于
        </div>
    `;

    // 菜单样式
    Object.assign(contextMenu.style, {
        position: 'fixed',
        display: 'none',
        backgroundColor: '#2c2c2c',
        border: '1px solid #444',
        borderRadius: '8px',
        padding: '4px 0',
        minWidth: '160px',
        zIndex: '999999',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        fontSize: '14px',
    });

    // 注入 CSS
    const style = document.createElement('style');
    style.textContent = `
        #cmd-lock-menu .menu-item {
            padding: 10px 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 10px;
            color: #e0e0e0;
            transition: background-color 0.15s;
        }
        #cmd-lock-menu .menu-item:hover {
            background-color: #4a4a4a;
        }
        #cmd-lock-menu .menu-item svg {
            flex-shrink: 0;
        }
        #cmd-lock-menu .menu-divider {
            height: 1px;
            background-color: #444;
            margin: 4px 0;
        }
        .cmd-lock-btn-instance {
            position: fixed;
            border-radius: 50%;
            cursor: move;
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            transition: background-color 0.3s, transform 0.1s;
            user-select: none;
        }
        .cmd-lock-btn-instance:hover {
            transform: scale(1.1);
        }
        .cmd-lock-btn-instance:active {
            transform: scale(0.95);
        }
        .cmd-lock-btn-instance.locked {
            box-shadow: 0 0 15px rgba(76, 175, 80, 0.6);
        }
    `;
    document.head.appendChild(style);

    // 更新按钮 SVG 图标
    function updateButtonAppearance(btn, locked) {
        const svgSize = Math.round(btnSize * 0.55);
        btn.innerHTML = `
            <svg width="${svgSize}" height="${svgSize}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="4" width="20" height="16" rx="2" stroke="white" stroke-width="2" fill="${locked ? '#4CAF50' : '#666'}"/>
                <path d="M7 10h10M7 14h6" stroke="white" stroke-width="2" stroke-linecap="round"/>
            </svg>
        `;
    }

    // 创建单个按钮元素
    function createButton(state, index) {
        const btn = document.createElement('div');
        btn.className = 'cmd-lock-btn-instance';

        Object.assign(btn.style, {
            left: state.x + 'px',
            top: state.y + 'px',
            width: btnSize + 'px',
            height: btnSize + 'px',
            backgroundColor: state.locked ? '#4CAF50' : '#666',
        });

        updateButtonAppearance(btn, state.locked);

        if (state.locked) btn.classList.add('locked');

        // 左键拖动
        btn.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
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
            }
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
                el: btn,
                locked: state.locked,
                isDragging: false,
                hasMoved: false,
                startX: 0,
                startY: 0,
                dragOffsetX: 0,
                dragOffsetY: 0,
            });
        });
    }

    // 保存所有状态到 localStorage
    function saveState() {
        buttonStates = buttons.map(b => {
            const rect = b.el.getBoundingClientRect();
            return { x: rect.left, y: rect.top, locked: b.locked };
        });
        localStorage.setItem('cmdLockButtons', JSON.stringify(buttonStates));
        localStorage.setItem('cmdLockBtnSize', btnSize.toString());
    }

    // 更新按钮锁定状态
    function updateBtnState(index, locked) {
        buttons[index].locked = locked;
        const btn = buttons[index].el;
        if (locked) {
            btn.classList.add('locked');
            btn.style.backgroundColor = '#4CAF50';
        } else {
            btn.classList.remove('locked');
            btn.style.backgroundColor = '#666';
        }
        updateButtonAppearance(btn, locked);
        saveState();
    }

    // 显示菜单
    function showMenu(x, y) {
        contextMenu.style.left = x + 'px';
        contextMenu.style.top = y + 'px';
        contextMenu.style.display = 'block';

        const menuRect = contextMenu.getBoundingClientRect();
        if (menuRect.right > window.innerWidth) {
            contextMenu.style.left = (x - menuRect.width) + 'px';
        }
        if (menuRect.bottom > window.innerHeight) {
            contextMenu.style.top = (y - menuRect.height) + 'px';
        }
    }

    // 隐藏菜单
    function hideMenu() {
        contextMenu.style.display = 'none';
    }

    // 全局拖动
    document.addEventListener('mousemove', (e) => {
        buttons.forEach((b) => {
            if (b.isDragging) {
                if (!b.hasMoved) {
                    const dist = Math.sqrt(
                        Math.pow(e.clientX - b.startX, 2) +
                        Math.pow(e.clientY - b.startY, 2)
                    );
                    if (dist > DRAG_THRESHOLD) b.hasMoved = true;
                }

                let newX = e.clientX - b.dragOffsetX;
                let newY = e.clientY - b.dragOffsetY;
                newX = Math.max(0, Math.min(newX, window.innerWidth - btnSize));
                newY = Math.max(0, Math.min(newY, window.innerHeight - btnSize));

                b.el.style.left = newX + 'px';
                b.el.style.top = newY + 'px';
            }
        });
    });

    // 全局松开
    document.addEventListener('mouseup', () => {
        buttons.forEach((b, i) => {
            if (b.isDragging) {
                b.isDragging = false;
                b.el.style.cursor = 'move';

                if (!b.hasMoved) {
                    updateBtnState(i, !b.locked);
                } else {
                    saveState();
                }
            }
        });
    });

    // 点击其他地方关闭菜单
    document.addEventListener('click', (e) => {
        const isButton = e.target.closest('.cmd-lock-btn-instance');
        if (!contextMenu.contains(e.target) && !isButton) {
            hideMenu();
        }
    });

    // 增加按钮
    function addButton() {
        if (buttons.length >= MAX_BTN_COUNT) return;

        const lastBtn = buttons[buttons.length - 1];
        const rect = lastBtn.el.getBoundingClientRect();
        let newX = rect.left + btnSize + 10;
        let newY = rect.top;

        // 换行
        if (newX > window.innerWidth - btnSize) {
            newX = 20;
            newY = rect.top - btnSize - 10;
            if (newY < 0) newY = Math.max(20, window.innerHeight - 70);
        }

        const state = { x: newX, y: newY, locked: false };
        buttonStates.push(state);

        const index = buttons.length;
        const btn = createButton(state, index);
        document.body.appendChild(btn);
        buttons.push({
            el: btn,
            locked: false,
            isDragging: false,
            hasMoved: false,
            startX: 0,
            startY: 0,
            dragOffsetX: 0,
            dragOffsetY: 0,
        });

        saveState();
    }

    // 减少按钮（移除最后一个）
    function removeButton() {
        if (buttons.length <= 1) return;

        const last = buttons.pop();
        if (last.el.parentNode) last.el.parentNode.removeChild(last.el);
        buttonStates.pop();
        saveState();
    }

    // 调整所有按钮大小
    function resizeButtons(newSize) {
        if (newSize < MIN_BTN_SIZE || newSize > MAX_BTN_SIZE) return;
        btnSize = newSize;

        buttons.forEach(b => {
            b.el.style.width = btnSize + 'px';
            b.el.style.height = btnSize + 'px';
            updateButtonAppearance(b.el, b.locked);

            // 确保不超出窗口
            const rect = b.el.getBoundingClientRect();
            let x = rect.left;
            let y = rect.top;
            if (x > window.innerWidth - btnSize) x = window.innerWidth - btnSize;
            if (y > window.innerHeight - btnSize) y = window.innerHeight - btnSize;
            b.el.style.left = x + 'px';
            b.el.style.top = y + 'px';
        });

        saveState();
    }

    // 菜单项点击
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
            case 'addBtn':
                addButton();
                break;
            case 'removeBtn':
                removeButton();
                break;
            case 'enlarge':
                resizeButtons(btnSize + SIZE_STEP);
                break;
            case 'shrink':
                resizeButtons(btnSize - SIZE_STEP);
                break;
            case 'about':
                alert('CMD 锁定切换 v1.0.4\n\n作者：wlzh\n\n一手吃东西，一手用鼠标，也能轻松新标签页打开链接！\n\n点击图标锁定/解锁 CMD 键，可拖动位置。\n右键菜单可增减按钮数量和调整大小。');
                break;
        }
        hideMenu();
    });

    // 拦截链接点击，后台打开新标签页
    document.addEventListener('click', (e) => {
        const anyLocked = buttons.some(b => b.locked);
        if (!anyLocked) return;

        let target = e.target;
        while (target && target.tagName !== 'A') {
            target = target.parentElement;
            if (target === document.documentElement) {
                target = null;
                break;
            }
        }

        if (target && target.tagName === 'A' && target.href) {
            if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                GM_openInTab(target.href, {
                    active: false,
                    insert: true,
                    setParent: true
                });
            }
        }
    }, true);

    // 确保所有按钮可见
    function ensureButtonsVisible() {
        buttons.forEach((b, i) => {
            const rect = b.el.getBoundingClientRect();
            const maxX = window.innerWidth - btnSize;
            const maxY = window.innerHeight - btnSize;

            let needsUpdate = false;
            let newX = rect.left;
            let newY = rect.top;

            if (rect.right <= 0 || rect.left >= window.innerWidth ||
                rect.bottom <= 0 || rect.top >= window.innerHeight) {
                newX = 20 + i * (btnSize + 10);
                newY = Math.max(20, window.innerHeight - 70);
                needsUpdate = true;
            } else {
                if (rect.right > window.innerWidth) { newX = maxX; needsUpdate = true; }
                if (rect.bottom > window.innerHeight) { newY = maxY; needsUpdate = true; }
                if (rect.left < 0) { newX = 0; needsUpdate = true; }
                if (rect.top < 0) { newY = 0; needsUpdate = true; }
            }

            if (needsUpdate) {
                b.el.style.left = newX + 'px';
                b.el.style.top = newY + 'px';
            }

            b.el.style.display = 'flex';
            b.el.style.visibility = 'visible';
            b.el.style.opacity = '1';
        });
    }

    // 添加菜单到页面
    document.body.appendChild(contextMenu);

    // 初始化按钮
    initButtons();
    ensureButtonsVisible();

    // 窗口大小改变时确保按钮在视野内
    window.addEventListener('resize', () => {
        ensureButtonsVisible();
    });

    // 定期检查按钮可见性
    setInterval(() => {
        buttons.forEach(b => {
            const rect = b.el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
                console.log('CMD 锁定: 检测到按钮被隐藏，恢复显示');
                ensureButtonsVisible();
            }
        });
    }, 5000);

    console.log('CMD 锁定切换脚本已加载 v1.0.4 - 作者：wlzh');
})();
