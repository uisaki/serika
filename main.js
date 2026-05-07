import { initBluetooth, isBluetoothConnected, sendCommand, sendLine } from './bluetooth.js';
import { initJoysticks, setMoveTarget } from './joystick.js';
import { initShortcuts } from './shortcuts.js';

// ---------- 全局状态 ----------
let currentMoveDir = 'F';
let currentRotateDir = 'F';
let currentClawCmd = 'F';
let currentSpeedPercent = 50;
let isConnected = false;

// ---------- DOM 元素 ----------
const statusSpan = document.querySelector('.status-bar span:first-child');
const speedSlider = document.getElementById('speedSlider');
const speedPercentSpan = document.getElementById('speedPercent');
const logEntriesDiv = document.getElementById('logEntries');

// 滑块步长设为10，避免非整十值
speedSlider.step = '10';

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
        speedSlider.disabled = false;
        moveCanvas.classList.remove('disabled');
        rotateCanvas.classList.remove('disabled');
        clawCanvas.classList.remove('disabled');
    } else {
        leftPanel.classList.add('disabled-controls');
        rightPanel.classList.add('disabled-controls');
        speedSlider.disabled = true;
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

// ---------- 速度控制 ----------
function setSpeedPercentUI(value) {
    value = Math.round(value / 10) * 10;
    value = Math.min(100, Math.max(0, value));
    if (currentSpeedPercent === value) return;
    currentSpeedPercent = value;
    speedSlider.value = value;
    speedPercentSpan.innerText = value + '%';
}

async function sendSpeedSteps(deltaSteps, isAccel) {
    const cmd = isAccel ? 'I' : 'K';
    for (let i = 0; i < Math.abs(deltaSteps); i++) {
        await sendCommand(cmd);
    }
}

function adjustSpeedBy(delta) {
    let newVal = currentSpeedPercent + delta;
    newVal = Math.round(newVal / 10) * 10;
    newVal = Math.min(100, Math.max(0, newVal));
    if (newVal !== currentSpeedPercent) {
        setSpeedPercentUI(newVal);
        return true;
    }
    return false;
}

// ---------- 全局挂载（供其他模块回调）----------
window.isBluetoothConnected = () => isConnected;
window.addLog = addLog;
window.setSpeedPercentUI = setSpeedPercentUI;
window.updateStatus = updateStatus;
window.updateControlsEnabled = updateControlsEnabled;

// ---------- 初始化各模块 ----------
initBluetooth(addLog, setSpeedPercentUI, updateStatus, updateControlsEnabled);
const { rotateJoystick, clawJoystick } = initJoysticks(updateMoveDirection, updateRotateDirection, updateClawCommand);
window.rotateJoystick = rotateJoystick;
window.clawJoystick = clawJoystick;

// 初始化快捷键：传入移动、旋转、机械爪、速度调整、控制台发送等回调
initShortcuts(setMoveTarget, (val) => rotateJoystick.setTarget(val), (val) => clawJoystick.setTarget(val), updateClawCommand, adjustSpeedBy, sendLine);

// ---------- 速度滑动条事件（消除回弹）----------
let isSettingValue = false;
speedSlider.addEventListener('input', (e) => {
    if (!isConnected) return;
    if (isSettingValue) return;

    let raw = parseInt(e.target.value);
    let rounded = Math.round(raw / 10) * 10;
    if (rounded !== raw) {
        isSettingValue = true;
        e.target.value = rounded;
        isSettingValue = false;
        raw = rounded;
    }

    if (raw === currentSpeedPercent) return;

    const diff = raw - currentSpeedPercent;
    const steps = Math.abs(diff) / 10;
    sendSpeedSteps(steps, diff > 0);

    currentSpeedPercent = raw;
    speedPercentSpan.innerText = raw + '%';
});

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