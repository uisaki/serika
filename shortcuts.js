import { DEFAULT_SHORTCUTS } from './config.js';
import { sendCommand } from './bluetooth.js';

let currentShortcuts = JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));
let keyMap = new Map();
let editingCell = null;

export function rebuildKeyMap() {
    keyMap.clear();
    for (let item of currentShortcuts) {
        let keys = [item.defaultKey];
        if (item.altKeys) keys.push(...item.altKeys);
        for (let k of keys) if (k) keyMap.set(k, { action: item.action, command: item.command });
    }
}

function renderShortcutTable() {
    const tbody = document.getElementById('shortcutTbody');
    tbody.innerHTML = '';
    currentShortcuts.forEach((item, idx) => {
        const row = tbody.insertRow();
        row.insertCell(0).textContent = item.action;
        const keyCell = row.insertCell(1);
        const span = document.createElement('span');
        span.className = 'shortcut-key';
        let display = item.defaultKey;
        if (display === ' ') display = 'Space';
        if (display === 'ArrowUp') display = '↑';
        else if (display === 'ArrowDown') display = '↓';
        else if (display === 'ArrowLeft') display = '←';
        else if (display === 'ArrowRight') display = '→';
        else if (display === 'Enter') display = '↵';
        else if (display === 'Tab') display = '⇥';
        span.textContent = display;
        span.setAttribute('data-idx', idx);
        span.addEventListener('click', (e) => { e.stopPropagation(); startEditKey(span, idx); });
        keyCell.appendChild(span);
    });
}

function startEditKey(span, idx) {
    if (editingCell) return;
    const oldKey = currentShortcuts[idx].defaultKey;
    const input = document.createElement('input');
    input.type = 'text';
    let initVal = oldKey;
    if (initVal === ' ') initVal = 'Space';
    if (initVal === 'Enter') initVal = 'Enter';
    if (initVal === 'Tab') initVal = 'Tab';
    input.value = initVal;
    input.style.width = '70px';
    input.style.background = '#1e88e5';
    input.style.color = 'white';
    input.style.border = 'none';
    input.style.borderRadius = '30px';
    input.style.padding = '2px 8px';
    input.style.textAlign = 'center';
    input.classList.add('shortcut-key-editing');
    span.style.display = 'none';
    span.parentNode.insertBefore(input, span);
    input.focus();
    const finish = () => {
        let newVal = input.value.trim();
        if (newVal === '') newVal = oldKey;
        if (newVal === 'Space') newVal = ' ';
        if (newVal === 'Enter') newVal = 'Enter';
        if (newVal === 'Tab') newVal = 'Tab';
        if (newVal === '↑') newVal = 'ArrowUp';
        else if (newVal === '↓') newVal = 'ArrowDown';
        else if (newVal === '←') newVal = 'ArrowLeft';
        else if (newVal === '→') newVal = 'ArrowRight';
        currentShortcuts[idx].defaultKey = newVal;
        localStorage.setItem('robotShortcuts', JSON.stringify(currentShortcuts));
        rebuildKeyMap();
        renderShortcutTable();
        editingCell = null;
    };
    input.addEventListener('blur', finish);
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') finish(); });
    editingCell = { input, span };
}

export function resetShortcuts() {
    currentShortcuts = JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));
    localStorage.setItem('robotShortcuts', JSON.stringify(currentShortcuts));
    rebuildKeyMap();
    renderShortcutTable();
    if (window.addLog) window.addLog('快捷键已重置');
}

export function initShortcuts(setMoveTargetCallback, rotateJoystickSetTarget, clawJoystickSetTarget, updateClawCommand, adjustSpeedBy, sendLine) {
    const stored = localStorage.getItem('robotShortcuts');
    if (stored) {
        try { let arr = JSON.parse(stored); if (Array.isArray(arr) && arr.length) currentShortcuts = arr; } catch (e) {}
    }
    rebuildKeyMap();
    renderShortcutTable();
    document.getElementById('resetShortcutsBtn').addEventListener('click', resetShortcuts);

    window.addEventListener('keydown', (e) => {
        // 焦点在字符发送控制台时，只有 Enter 和 Tab 快捷键生效，其他键忽略
        const activeEl = document.activeElement;
        const isConsoleFocused = activeEl && activeEl.id === 'sendInput';
        if (isConsoleFocused && e.key !== 'Enter' && e.key !== 'Tab') {
            return;
        }

        if (!window.isBluetoothConnected?.()) return;
        let key = e.key;
        if (key === ' ') key = ' ';
        if (key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta') return;
        let lowerKey = key.toLowerCase();
        let mapping = keyMap.get(key) || keyMap.get(lowerKey);
        if (mapping) {
            e.preventDefault();
            const cmd = mapping.command;
            if (cmd === 'W') setMoveTargetCallback(0, -1);
            else if (cmd === 'S') setMoveTargetCallback(0, 1);
            else if (cmd === 'A') setMoveTargetCallback(-1, 0);
            else if (cmd === 'D') setMoveTargetCallback(1, 0);
            else if (cmd === 'F') sendCommand('F');
            else if (cmd === 'R_CW') rotateJoystickSetTarget?.(1);
            else if (cmd === 'R_CCW') rotateJoystickSetTarget?.(-1);
            else if (cmd === 'CLAW_OPEN') clawJoystickSetTarget?.(1);
            else if (cmd === 'CLAW_CLOSE') clawJoystickSetTarget?.(-1);
            else if (cmd === 'BRAKE') sendCommand(' ');      // 发送空格命令（刹车）
            else if (cmd === 'speedUp') { if (adjustSpeedBy(10)) sendCommand('I'); }
            else if (cmd === 'speedDown') { if (adjustSpeedBy(-10)) sendCommand('K'); }
            else if (cmd === 'CONSOLE_SEND') {
                const sendInput = document.getElementById('sendInput');
                if (sendInput && sendInput.value.trim() !== '') {
                    sendLine(sendInput.value.trim());
                    sendInput.value = '';
                }
            }
            else if (cmd === 'CONSOLE_FOCUS') {
                const sendInput = document.getElementById('sendInput');
                if (sendInput) {
                    if (document.activeElement === sendInput) sendInput.blur();
                    else sendInput.focus();
                }
            }
        }
    });

    window.addEventListener('keyup', (e) => {
        // 同样焦点过滤
        const activeEl = document.activeElement;
        const isConsoleFocused = activeEl && activeEl.id === 'sendInput';
        if (isConsoleFocused && e.key !== 'Enter' && e.key !== 'Tab') {
            return;
        }

        if (!window.isBluetoothConnected?.()) return;
        let key = e.key;
        if (key === ' ') key = ' ';
        let lowerKey = key.toLowerCase();
        let mapping = keyMap.get(key) || keyMap.get(lowerKey);
        if (mapping && (mapping.command === 'W' || mapping.command === 'A' || mapping.command === 'S' || mapping.command === 'D')) {
            e.preventDefault(); setMoveTargetCallback(0, 0);
        }
        if (mapping && (mapping.command === 'R_CW' || mapping.command === 'R_CCW')) {
            e.preventDefault(); rotateJoystickSetTarget?.(0);
        }
        if (mapping && (mapping.command === 'CLAW_OPEN' || mapping.command === 'CLAW_CLOSE')) {
            e.preventDefault(); clawJoystickSetTarget?.(0);
        }
    });
}
