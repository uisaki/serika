import { initBluetooth, isBluetoothConnected, sendCommand, sendLine } from './bluetooth.js';
import { initJoysticks, setMoveTarget } from './joystick.js';
import { initShortcuts } from './shortcuts.js';

// ---------- 全局状态 ----------
let currentMoveDir = 'F';
let currentRotateDir = 'F';
let currentClawCmd = 'F';
let isConnected = false;

// ---------- DOM 元素 ----------
const statusSpan = document.querySelector('.status-bar span:first-child');
const logEntriesDiv = document.getElementById('logEntries');

// ---------- 日志 ----------
function addLog(msg) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = new Date().toLocaleTimeString() + ' - ' + msg;
    logEntriesDiv.appendChild(entry);
    entry.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    console.log(msg);
}

function updateStatus(msg) {
    statusSpan.innerHTML = `⚡ ${msg}`;
    addLog(msg);
}

// ---------- 连接状态控制 ----------
function updateControlsEnabled(connected) {
    isConnected = connected;
    const leftPanel = document.querySelector('.left-panel');
    const rightPanel = document.querySelector('.right-panel');
    const moveCanvas = document.getElementById('moveCanvas');
    const rotateCanvas = document.getElementById('rotateCanvas');
    const clawCanvas = document.getElementById('clawCanvas');
    if (connected) {
        leftPanel.classList.remove('disabled-controls');
        rightPanel.classList.remove('disabled-controls');
        moveCanvas.classList.remove('disabled');
        rotateCanvas.classList.remove('disabled');
        clawCanvas.classList.remove('disabled');
    } else {
        leftPanel.classList.add('disabled-controls');
        rightPanel.classList.add('disabled-controls');
        moveCanvas.classList.add('disabled');
        rotateCanvas.classList.add('disabled');
        clawCanvas.classList.add('disabled');
        if (window.rotateJoystick) window.rotateJoystick.setTarget(0);
        if (window.clawJoystick) window.clawJoystick.setTarget(0);
        setMoveTarget(0, 0);
    }
}

// ---------- 运动命令合并发送 ----------
function sendCombinedMove() {
    let cmd = 'F';
    if (currentRotateDir !== 'F') cmd = currentRotateDir;
    else if (currentMoveDir !== 'F') cmd = currentMoveDir;
    sendCommand(cmd);
}

function updateMoveDirection(dir) {
    if (currentMoveDir === dir) return;
    currentMoveDir = dir;
    sendCombinedMove();
}

function updateRotateDirection(dir) {
    if (currentRotateDir === dir) return;
    currentRotateDir = dir;
    sendCombinedMove();
}

function updateClawCommand(cmd) {
    if (currentClawCmd === cmd) return;
    currentClawCmd = cmd;
    sendCommand(cmd);
}

// ---------- 全局挂载 ----------
window.isBluetoothConnected = () => isConnected;
window.addLog = addLog;
window.updateStatus = updateStatus;
window.updateControlsEnabled = updateControlsEnabled;

// ---------- 初始化各模块 ----------
initBluetooth(addLog, updateStatus, updateControlsEnabled);
const { rotateJoystick, clawJoystick } = initJoysticks(updateMoveDirection, updateRotateDirection, updateClawCommand);
window.rotateJoystick = rotateJoystick;
window.clawJoystick = clawJoystick;

// 速度快捷键直接发送 I/K，不需要前端调整滑块
const speedUp = () => { if (isConnected) sendCommand('I'); };
const speedDown = () => { if (isConnected) sendCommand('K'); };
initShortcuts(setMoveTarget, (val) => rotateJoystick.setTarget(val), (val) => clawJoystick.setTarget(val), updateClawCommand, speedUp, speedDown, sendLine);

// ---------- 控制台发送 ----------
const sendInput = document.getElementById('sendInput');
const sendBtn = document.getElementById('sendBtn');
if (sendBtn) {
    sendBtn.addEventListener('click', () => {
        if (!isConnected) {
            addLog('未连接蓝牙，无法发送');
            return;
        }
        const text = sendInput.value.trim();
        if (text === '') return;
        sendLine(text);
        sendInput.value = '';
    });
}

updateControlsEnabled(false);