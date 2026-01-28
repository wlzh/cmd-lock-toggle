// ==UserScript==
// @name         CMD 锁定，自动后台开链接 - 一手吃东西不影响
// @namespace    http://tampermonkey.net/
// @version      1.0.3
// @description  左下角图标点击锁定/解锁，自动后台打开新标签页，无需按住 CMD 键。作者：wlzh
// @author       wlzh
// @match        *://*/*
// @grant        GM_openInTab
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 状态变量
    let cmdLocked = false;
    let isDragging = false;
    let hasMoved = false;
    let startX = 0;
    let startY = 0;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    // 从 localStorage 读取位置
    const savedPos = localStorage.getItem('cmdLockPosition');
    let position = { x: 20, y: window.innerHeight - 70 }; // 默认位置

    if (savedPos) {
        try {
            const parsed = JSON.parse(savedPos);
            // 验证保存的位置是否合理（在可视区域内）
            const maxX = window.innerWidth - 44;
            const maxY = window.innerHeight - 44;
            if (parsed.x >= 0 && parsed.x <= maxX && parsed.y >= 0 && parsed.y <= maxY) {
                position = parsed;
            } else {
                // 位置不合理，清除并使用默认位置
                console.log('CMD 锁定: 保存的位置超出可视范围，使用默认位置');
                localStorage.removeItem('cmdLockPosition');
            }
        } catch (e) {
            console.log('CMD 锁定: 读取位置失败，使用默认位置', e);
            localStorage.removeItem('cmdLockPosition');
        }
    }

    // 创建主按钮
    const cmdBtn = document.createElement('div');
    cmdBtn.id = 'cmd-lock-btn';
    cmdBtn.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="4" width="20" height="16" rx="2" stroke="white" stroke-width="2" fill="${cmdLocked ? '#4CAF50' : '#666'}"/>
            <path d="M7 10h10M7 14h6" stroke="white" stroke-width="2" stroke-linecap="round"/>
        </svg>
    `;

    // 样式
    Object.assign(cmdBtn.style, {
        position: 'fixed',
        left: position.x + 'px',
        top: position.y + 'px',
        width: '44px',
        height: '44px',
        borderRadius: '50%',
        backgroundColor: cmdLocked ? '#4CAF50' : '#666',
        cursor: 'move',
        zIndex: '999999',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
        transition: 'background-color 0.3s, transform 0.1s',
        userSelect: 'none',
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

    // 添加菜单 CSS
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
        #cmd-lock-btn:hover {
            transform: scale(1.1);
        }
        #cmd-lock-btn:active {
            transform: scale(0.95);
        }
        #cmd-lock-btn.locked {
            background-color: #4CAF50 !important;
            box-shadow: 0 0 15px rgba(76, 175, 80, 0.6);
        }
    `;
    document.head.appendChild(style);

    // 更新 CMD 状态
    function updateCmdState(locked) {
        cmdLocked = locked;
        if (locked) {
            cmdBtn.classList.add('locked');
            cmdBtn.querySelector('svg rect').setAttribute('fill', '#4CAF50');
        } else {
            cmdBtn.classList.remove('locked');
            cmdBtn.querySelector('svg rect').setAttribute('fill', '#666');
        }
    }

    // 保存位置
    function savePosition() {
        const rect = cmdBtn.getBoundingClientRect();
        position = { x: rect.left, y: rect.top };
        localStorage.setItem('cmdLockPosition', JSON.stringify(position));
    }

    // 显示菜单
    function showMenu(x, y) {
        contextMenu.style.left = x + 'px';
        contextMenu.style.top = y + 'px';
        contextMenu.style.display = 'block';

        // 确保菜单在窗口内
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

    // 拖动事件
    cmdBtn.addEventListener('mousedown', (e) => {
        if (e.button === 0) { // 左键
            isDragging = true;
            hasMoved = false;
            startX = e.clientX;
            startY = e.clientY;
            const rect = cmdBtn.getBoundingClientRect();
            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;
            cmdBtn.style.cursor = 'grabbing';
            e.preventDefault();
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            // 检测是否有明显移动（超过 3 像素）
            if (!hasMoved) {
                const moveDistance = Math.sqrt(
                    Math.pow(e.clientX - startX, 2) +
                    Math.pow(e.clientY - startY, 2)
                );
                if (moveDistance > 3) {
                    hasMoved = true;
                }
            }

            let newX = e.clientX - dragOffsetX;
            let newY = e.clientY - dragOffsetY;

            // 边界检查
            newX = Math.max(0, Math.min(newX, window.innerWidth - 44));
            newY = Math.max(0, Math.min(newY, window.innerHeight - 44));

            cmdBtn.style.left = newX + 'px';
            cmdBtn.style.top = newY + 'px';
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (isDragging) {
            isDragging = false;
            cmdBtn.style.cursor = 'move';

            // 只有在未移动（或移动距离很小）时才切换状态
            if (!hasMoved) {
                updateCmdState(!cmdLocked);
            } else {
                // 移动过，保存新位置
                savePosition();
            }
        }
    });

    // 右键菜单
    cmdBtn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showMenu(e.clientX, e.clientY);
    });

    // 点击其他地方关闭菜单
    document.addEventListener('click', (e) => {
        if (!contextMenu.contains(e.target) && e.target !== cmdBtn) {
            hideMenu();
        }
    });

    // 菜单项点击
    contextMenu.addEventListener('click', (e) => {
        const item = e.target.closest('.menu-item');
        if (!item) return;

        const action = item.dataset.action;
        switch (action) {
            case 'lock':
                updateCmdState(true);
                break;
            case 'unlock':
                updateCmdState(false);
                break;
            case 'about':
                alert('CMD 锁定切换 v1.0\n\n作者：wlzh\n\n一手吃东西，一手用鼠标，也能轻松新标签页打开链接！\n\n点击图标锁定/解锁 CMD 键，可拖动位置。');
                break;
        }
        hideMenu();
    });

    // 拦截链接点击，模拟 CMD+Shift 键（后台打开新标签页）
    document.addEventListener('click', (e) => {
        if (!cmdLocked) return;

        // 查找点击的链接
        let target = e.target;
        while (target && target.tagName !== 'A') {
            target = target.parentElement;
            if (target === document.documentElement) {
                target = null;
                break;
            }
        }

        if (target && target.tagName === 'A' && target.href) {
            // 检查是否已经有修饰键
            if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();

                // 使用 GM_openInTab 后台打开（不激活新标签页）
                GM_openInTab(target.href, {
                    active: false,      // 不激活新标签页，保持在当前页面
                    insert: true,       // 在标签页栏中插入
                    setParent: true     // 设置父标签页
                });
            }
        }
    }, true);

    // 添加到页面
    document.body.appendChild(cmdBtn);
    document.body.appendChild(contextMenu);

    // 确保按钮可见且在可视区域内
    function ensureButtonVisible() {
        const rect = cmdBtn.getBoundingClientRect();
        const maxX = window.innerWidth - 44;
        const maxY = window.innerHeight - 44;
        let needsUpdate = false;
        let newX = rect.left;
        let newY = rect.top;

        // 检查是否超出可视区域
        if (rect.right <= 0 || rect.left >= window.innerWidth ||
            rect.bottom <= 0 || rect.top >= window.innerHeight) {
            // 完全在可视区域外，重置到默认位置
            newX = 20;
            newY = Math.max(20, window.innerHeight - 70);
            needsUpdate = true;
            console.log('CMD 锁定: 按钮不在可视区域，重置位置');
        } else {
            // 部分超出，调整到边缘
            if (rect.right > window.innerWidth) {
                newX = maxX;
                needsUpdate = true;
            }
            if (rect.bottom > window.innerHeight) {
                newY = maxY;
                needsUpdate = true;
            }
            if (rect.left < 0) {
                newX = 0;
                needsUpdate = true;
            }
            if (rect.top < 0) {
                newY = 0;
                needsUpdate = true;
            }
        }

        if (needsUpdate) {
            cmdBtn.style.left = newX + 'px';
            cmdBtn.style.top = newY + 'px';
            position = { x: newX, y: newY };
            localStorage.setItem('cmdLockPosition', JSON.stringify(position));
        }

        // 确保按钮可见（没有被其他元素遮挡）
        cmdBtn.style.display = 'flex';
        cmdBtn.style.visibility = 'visible';
        cmdBtn.style.opacity = '1';
    }

    // 页面加载完成后立即检查
    ensureButtonVisible();

    // 窗口大小改变时确保按钮在视野内
    window.addEventListener('resize', () => {
        ensureButtonVisible();
    });

    // 定期检查按钮可见性（防止页面动态内容遮挡）
    setInterval(() => {
        const rect = cmdBtn.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            console.log('CMD 锁定: 检测到按钮被隐藏，恢复显示');
            ensureButtonVisible();
        }
    }, 5000);

    console.log('CMD 锁定切换脚本已加载 - 作者：wlzh');
})();
