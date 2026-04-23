import { sendCommand } from './bluetooth.js';
import { rebuildKeyMap } from './shortcuts.js';

const customButtons = [
    { btnId: 'customBtn1', inputId: 'customCmd1', defaultKey: 'N', action: '落子' },
    { btnId: 'customBtn2', inputId: 'customCmd2', defaultKey: 'M', action: '重置' },
    { btnId: 'customBtn3', inputId: 'customCmd3', defaultKey: 'Q', action: '切换游戏' }
];
let customCommands = {};
let customShortcutKeys = {};

export function getCustomShortcutKeys() {
    return customShortcutKeys;
}

function updateCustomShortcuts() {
    customShortcutKeys = {};
    customButtons.forEach(item => {
        const key = customCommands[item.btnId];
        if (key) customShortcutKeys[key] = item.action;
    });
    rebuildKeyMap(customShortcutKeys);
}

export function initCustomButtons() {
    customButtons.forEach(item => {
        const btn = document.getElementById(item.btnId);
        const input = document.getElementById(item.inputId);
        const saved = localStorage.getItem(`customCmd_${item.btnId}`);
        if (saved && /^[A-Za-z]$/.test(saved)) {
            input.value = saved.toUpperCase();
        } else {
            input.value = item.defaultKey;
        }
        customCommands[item.btnId] = input.value.toUpperCase();

        input.addEventListener('change', () => {
            let val = input.value.trim().toUpperCase();
            if (val.length === 0 || !/^[A-Z]$/.test(val)) {
                val = item.defaultKey;
                input.value = val;
            }
            customCommands[item.btnId] = val;
            localStorage.setItem(`customCmd_${item.btnId}`, val);
            updateCustomShortcuts();
        });

        btn.addEventListener('click', () => {
            const cmd = customCommands[item.btnId];
            if (cmd && window.isBluetoothConnected?.()) sendCommand(cmd);
        });
    });
    updateCustomShortcuts();
}