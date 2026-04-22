// ==================== 默认快捷键配置 ====================
const DEFAULT_SHORTCUTS = [
    { action: "前进 (W)", command: "W", defaultKey: "w", altKeys: ["W", "ArrowUp"] },
    { action: "后退 (S)", command: "S", defaultKey: "s", altKeys: ["S", "ArrowDown"] },
    { action: "左移 (A)", command: "A", defaultKey: "a", altKeys: ["A", "ArrowLeft"] },
    { action: "右移 (D)", command: "D", defaultKey: "d", altKeys: ["D", "ArrowRight"] },
    { action: "停止 (F)", command: "F", defaultKey: "f", altKeys: ["F"] },
    { action: "右旋 (顺时针)", command: "R_CW", defaultKey: "l", altKeys: ["L"] },
    { action: "左旋 (逆时针)", command: "R_CCW", defaultKey: "j", altKeys: ["J"] },
    { action: "机械爪张开", command: "CLAW_OPEN", defaultKey: "o", altKeys: ["O"] },
    { action: "机械爪闭合", command: "CLAW_CLOSE", defaultKey: "u", altKeys: ["U"] },
    { action: "加速 (I)", command: "speedUp", defaultKey: "i", altKeys: ["I"] },
    { action: "减速 (K)", command: "speedDown", defaultKey: "k", altKeys: ["K"] },
    { action: "发送（控制台）", command: "CONSOLE_SEND", defaultKey: "Enter", altKeys: [] },
    { action: "切换焦点（控制台）", command: "CONSOLE_FOCUS", defaultKey: "Tab", altKeys: [] }
];

// ==================== 全局变量 ====================
let device = null, characteristic = null;
let keyMap = new Map();
let editingCell = null;
let currentShortcuts = JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));

// 状态
let currentMoveDir = 'F';
let currentRotateDir = 'F';
let currentClawCmd = 'F';
let currentSpeedPercent = 50;
let isConnected = false;

// 移动摇杆专用标志和动画
let moveDragged = false;
let moveAnimFrame = null;
let moveTargetX = 0, moveTargetY = 0, moveCurrentX = 0, moveCurrentY = 0;

// 接收缓冲区
let receiveBuffer = '';

// UI 元素
const statusSpan = document.querySelector('.status-bar span:first-child');
const bluetoothNameSpan = document.getElementById('bluetoothName');
const speedSlider = document.getElementById('speedSlider');
const speedPercentSpan = document.getElementById('speedPercent');
const logEntriesDiv = document.getElementById('logEntries');

// 摇杆canvas
const moveCanvas = document.getElementById('moveCanvas');
const ctxMove = moveCanvas.getContext('2d');
const rotateCanvas = document.getElementById('rotateCanvas');
const clawCanvas = document.getElementById('clawCanvas');

const leftPanel = document.querySelector('.left-panel');
const rightPanel = document.querySelector('.right-panel');

// ==================== 辅助函数 ====================
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

function updateControlsEnabled() {
    if (isConnected) {
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
        if (typeof setMoveTarget === 'function') setMoveTarget(0, 0);
        if (rotateJoystick) rotateJoystick.setTarget(0);
        if (clawJoystick) clawJoystick.setTarget(0);
    }
}

// ==================== 蓝牙发送（新协议：$命令 参数\n） ====================
async function sendCommand(cmd) {
    if (!characteristic || !isConnected) return false;
    const payload = `$${cmd}\n`;
    const encoder = new TextEncoder();
    await characteristic.writeValue(encoder.encode(payload));
    addLog(`📤 ${payload.trim()}`);
    return true;
}

async function sendLine(line) {
    if (!characteristic || !isConnected) return false;
    const payload = `$${line}\n`;
    const encoder = new TextEncoder();
    await characteristic.writeValue(encoder.encode(payload));
    addLog(`📤 ${payload.trim()}`);
    return true;
}

async function sendRaw(data) {
    if (!characteristic || !isConnected) return false;
    const encoder = new TextEncoder();
    await characteristic.writeValue(encoder.encode(data));
    addLog(`📤 原始: ${data}`);
    return true;
}

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

function setSpeedPercentUI(value) {
    value = Math.round(value / 10) * 10;
    value = Math.min(100, Math.max(0, value));
    if (currentSpeedPercent === value) return;
    currentSpeedPercent = value;
    speedSlider.value = value;
    speedPercentSpan.innerText = value + '%';
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

// ==================== 蓝牙接收处理 ====================
function handleNotifications(event) {
    const value = event.target.value;
    const str = new TextDecoder().decode(value);
    receiveBuffer += str;
    let newlineIndex;
    while ((newlineIndex = receiveBuffer.indexOf('\n')) !== -1) {
        const line = receiveBuffer.substring(0, newlineIndex);
        receiveBuffer = receiveBuffer.substring(newlineIndex + 1);
        parseReceivedLine(line);
    }
}

function parseReceivedLine(line) {
    addLog(`📨 ${line}`);
    if (line.startsWith('@speed=')) {
        const speed = parseInt(line.substring(7));
        if (!isNaN(speed)) {
            const percent = Math.round(speed / 10);
            setSpeedPercentUI(percent);
        }
    } else if (line.startsWith('@time=')) {
        const time = line.substring(6);
        addLog(`⏰ 时间: ${time}`);
    } else if (line.startsWith('@date=')) {
        const date = line.substring(6);
        addLog(`📅 日期: ${date}`);
    }
}

async function queryInfo() {
    if (!characteristic || !isConnected) return;
    sendLine('q -t');
    sendLine('q -d');
    sendLine('q -s');
}

// ==================== 移动摇杆 ====================
const MOVE_SIZE = moveCanvas.width;
const MOVE_MAX_RADIUS = MOVE_SIZE * 0.4;
const MOVE_CX = MOVE_SIZE / 2, MOVE_CY = MOVE_SIZE / 2;
const MOVE_RADIUS = MOVE_SIZE * 0.42;
const MOVE_HANDLE_RADIUS = MOVE_RADIUS * 0.35;

function drawMoveJoystick() {
    const thumbX = MOVE_CX + moveCurrentX * MOVE_MAX_RADIUS;
    const thumbY = MOVE_CY + moveCurrentY * MOVE_MAX_RADIUS;
    ctxMove.clearRect(0, 0, MOVE_SIZE, MOVE_SIZE);
    ctxMove.beginPath();
    ctxMove.arc(MOVE_CX, MOVE_CY, MOVE_RADIUS, 0, 2 * Math.PI);
    ctxMove.fillStyle = '#e2e8f0';
    ctxMove.fill();
    ctxMove.strokeStyle = '#cbd5e1';
    ctxMove.lineWidth = 1.5;
    ctxMove.stroke();
    ctxMove.beginPath();
    ctxMove.moveTo(MOVE_CX - MOVE_RADIUS, MOVE_CY);
    ctxMove.lineTo(MOVE_CX + MOVE_RADIUS, MOVE_CY);
    ctxMove.moveTo(MOVE_CX, MOVE_CY - MOVE_RADIUS);
    ctxMove.lineTo(MOVE_CX, MOVE_CY + MOVE_RADIUS);
    ctxMove.stroke();
    ctxMove.beginPath();
    ctxMove.arc(thumbX, thumbY, MOVE_HANDLE_RADIUS, 0, 2 * Math.PI);
    ctxMove.fillStyle = '#1e88e5';
    ctxMove.fill();
}

function updateMoveAnimation() {
    let dx = moveTargetX - moveCurrentX;
    let dy = moveTargetY - moveCurrentY;
    if (Math.abs(dx) < 0.005 && Math.abs(dy) < 0.005) {
        moveCurrentX = moveTargetX;
        moveCurrentY = moveTargetY;
        if (moveAnimFrame) cancelAnimationFrame(moveAnimFrame);
        moveAnimFrame = null;
    } else {
        moveCurrentX += dx * 0.3;
        moveCurrentY += dy * 0.3;
        moveAnimFrame = requestAnimationFrame(() => {
            updateMoveAnimation();
            drawMoveJoystick();
        });
    }
    drawMoveJoystick();
}

function snapToAxis(nx, ny) {
    if (Math.abs(ny) >= Math.abs(nx)) return { x: 0, y: Math.sign(ny) * Math.hypot(nx, ny) };
    else return { x: Math.sign(nx) * Math.hypot(nx, ny), y: 0 };
}

function setMoveTarget(nx, ny) {
    let len = Math.hypot(nx, ny);
    if (len > 1) { nx /= len; ny /= len; }
    const snapped = snapToAxis(nx, ny);
    moveTargetX = snapped.x;
    moveTargetY = snapped.y;
    if (!moveAnimFrame) updateMoveAnimation();
    let dir = 'F';
    if (moveTargetY < -0.1) dir = 'W';
    else if (moveTargetY > 0.1) dir = 'S';
    else if (moveTargetX < -0.1) dir = 'A';
    else if (moveTargetX > 0.1) dir = 'D';
    updateMoveDirection(dir);
}

function isPointInCanvas(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right &&
        clientY >= rect.top && clientY <= rect.bottom;
}

let moveActive = false;
function handleMoveStart(e) {
    if (!isConnected) return;
    e.preventDefault();
    moveActive = true;
    moveDragged = false;
    handleMoveMove(e);
}
function handleMoveMove(e) {
    if (!moveActive || !isConnected) return;
    e.preventDefault();
    let clientX, clientY;
    if (e.touches) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }
    if (!isPointInCanvas(moveCanvas, clientX, clientY)) {
        if (moveDragged) setMoveTarget(0, 0);
        moveActive = false;
        moveDragged = false;
        return;
    }
    moveDragged = true;
    const rect = moveCanvas.getBoundingClientRect();
    const scaleX = moveCanvas.width / rect.width;
    const scaleY = moveCanvas.height / rect.height;
    let cx = (clientX - rect.left) * scaleX;
    let cy = (clientY - rect.top) * scaleY;
    cx = Math.min(Math.max(cx, 0), moveCanvas.width);
    cy = Math.min(Math.max(cy, 0), moveCanvas.height);
    let dx = (cx - MOVE_CX) / MOVE_MAX_RADIUS;
    let dy = (cy - MOVE_CY) / MOVE_MAX_RADIUS;
    let len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    setMoveTarget(dx, dy);
}
function handleMoveEnd(e) {
    if (!moveActive) return;
    if (moveDragged) setMoveTarget(0, 0);
    moveActive = false;
    moveDragged = false;
}

// ==================== 水平摇杆通用类 ====================
class HorizontalJoystick {
    constructor(canvas, onUpdate, deadzone = 0.2) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.onUpdate = onUpdate;
        this.deadzone = deadzone;
        this.active = false;
        this.dragged = false;
        this.targetX = 0;
        this.currentX = 0;
        this.animFrame = null;
        this.width = canvas.width;
        this.height = canvas.height;
        this.maxRadius = this.width * 0.3;
        this.handleRadius = Math.min(this.height, this.width) * 0.35;
        this.centerX = this.width / 2;
        this.centerY = this.height / 2;
        this.draw = this.draw.bind(this);
        this.updateAnimation = this.updateAnimation.bind(this);
        this.start = this.start.bind(this);
        this.move = this.move.bind(this);
        this.end = this.end.bind(this);
        this.isPointInside = this.isPointInside.bind(this);
        this.canvas.addEventListener('mousedown', this.start);
        window.addEventListener('mousemove', this.move);
        window.addEventListener('mouseup', this.end);
        this.canvas.addEventListener('touchstart', this.start, { passive: false });
        window.addEventListener('touchmove', this.move, { passive: false });
        window.addEventListener('touchend', this.end);
        this.draw();
    }
    isPointInside(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        return clientX >= rect.left && clientX <= rect.right &&
            clientY >= rect.top && clientY <= rect.bottom;
    }
    draw() {
        const thumbX = this.centerX + this.currentX * this.maxRadius;
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.ctx.fillStyle = '#e2e8f0';
        this.ctx.fillRect(0, 0, this.width, this.height);
        this.ctx.fillStyle = '#94a3b8';
        this.ctx.fillRect(this.centerX - 1, 0, 2, this.height);
        this.ctx.beginPath();
        this.ctx.arc(thumbX, this.centerY, this.handleRadius, 0, 2 * Math.PI);
        this.ctx.fillStyle = '#1e88e5';
        this.ctx.fill();
    }
    updateAnimation() {
        let dx = this.targetX - this.currentX;
        if (Math.abs(dx) < 0.005) {
            this.currentX = this.targetX;
            if (this.animFrame) cancelAnimationFrame(this.animFrame);
            this.animFrame = null;
        } else {
            this.currentX += dx * 0.3;
            this.animFrame = requestAnimationFrame(() => {
                this.updateAnimation();
                this.draw();
            });
        }
        this.draw();
        let val = Math.abs(this.currentX) < this.deadzone ? 0 : (this.currentX > 0 ? 1 : -1);
        this.onUpdate(val);
    }
    setTarget(x) {
        this.targetX = Math.min(1, Math.max(-1, x));
        if (!this.animFrame) this.updateAnimation();
    }
    start(e) {
        if (!isConnected) return;
        e.preventDefault();
        this.active = true;
        this.dragged = false;
        this.move(e);
    }
    move(e) {
        if (!this.active || !isConnected) return;
        e.preventDefault();
        let clientX = e.clientX ?? (e.touches ? e.touches[0].clientX : 0);
        let clientY = e.clientY ?? (e.touches ? e.touches[0].clientY : 0);
        if (!this.isPointInside(clientX, clientY)) {
            if (this.dragged) this.setTarget(0);
            this.active = false;
            this.dragged = false;
            return;
        }
        this.dragged = true;
        const rect = this.canvas.getBoundingClientRect();
        let x = (clientX - rect.left) / rect.width * this.width;
        x = Math.min(Math.max(x, 0), this.width);
        let dx = (x - this.centerX) / this.maxRadius;
        dx = Math.min(1, Math.max(-1, dx));
        this.setTarget(dx);
    }
    end(e) {
        if (!this.active) return;
        if (this.dragged) this.setTarget(0);
        this.active = false;
        this.dragged = false;
    }
}

// ==================== 快捷键处理 ====================
function rebuildKeyMap() {
    keyMap.clear();
    for (let item of currentShortcuts) {
        let keys = [item.defaultKey];
        if (item.altKeys) keys.push(...item.altKeys);
        for (let k of keys) if (k) keyMap.set(k, { action: item.action, command: item.command });
    }
    // 添加自定义按钮的快捷键
    for (let key in customShortcutKeys) {
        keyMap.set(key, { action: `${customShortcutKeys[key]} (自定义)`, command: `CUSTOM_${key}` });
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

function resetShortcuts() {
    currentShortcuts = JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));
    localStorage.setItem('robotShortcuts', JSON.stringify(currentShortcuts));
    rebuildKeyMap();
    renderShortcutTable();
    addLog('快捷键已重置');
}

// ==================== 键盘事件 ====================
let activeClawShortcut = false;
let clawRepeatTimer = null;

function handleKeyDown(e) {
    if (!isConnected) return;
    let key = e.key;
    if (key === ' ') key = 'Space';
    if (key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta') return;
    let lowerKey = key.toLowerCase();
    let mapping = keyMap.get(key) || keyMap.get(lowerKey);
    if (mapping) {
        e.preventDefault();
        const cmd = mapping.command;
        if (cmd.startsWith('CUSTOM_')) {
            // 自定义命令，直接发送字母
            const letter = cmd.substring(7);
            sendCommand(letter);
        } else if (cmd === 'W') setMoveTarget(0, -1);
        else if (cmd === 'S') setMoveTarget(0, 1);
        else if (cmd === 'A') setMoveTarget(-1, 0);
        else if (cmd === 'D') setMoveTarget(1, 0);
        else if (cmd === 'F') { setMoveTarget(0, 0); rotateJoystick.setTarget(0); updateClawCommand('F'); sendCommand('F'); }
        else if (cmd === 'R_CW') rotateJoystick.setTarget(1);
        else if (cmd === 'R_CCW') rotateJoystick.setTarget(-1);
        else if (cmd === 'CLAW_OPEN') {
            if (!activeClawShortcut) {
                activeClawShortcut = true;
                if (clawRepeatTimer) clearInterval(clawRepeatTimer);
                clawRepeatTimer = setInterval(() => {
                    if (isConnected) sendCommand('O');
                }, 30);
            }
        }
        else if (cmd === 'CLAW_CLOSE') {
            if (!activeClawShortcut) {
                activeClawShortcut = true;
                if (clawRepeatTimer) clearInterval(clawRepeatTimer);
                clawRepeatTimer = setInterval(() => {
                    if (isConnected) sendCommand('U');
                }, 30);
            }
        }
        else if (cmd === 'speedUp') {
            if (adjustSpeedBy(10)) sendCommand('I');
        }
        else if (cmd === 'speedDown') {
            if (adjustSpeedBy(-10)) sendCommand('K');
        }
        else if (cmd === 'CONSOLE_SEND') {
            const sendInput = document.getElementById('sendInput');
            if (sendInput && sendInput.value.trim() !== '') {
                const text = sendInput.value.trim();
                sendLine(text);
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
}

function handleKeyUp(e) {
    if (!isConnected) return;
    let key = e.key;
    if (key === ' ') key = 'Space';
    let lowerKey = key.toLowerCase();
    let mapping = keyMap.get(key) || keyMap.get(lowerKey);
    if (mapping && (mapping.command === 'W' || mapping.command === 'A' || mapping.command === 'S' || mapping.command === 'D')) {
        e.preventDefault(); setMoveTarget(0, 0);
    }
    if (mapping && (mapping.command === 'R_CW' || mapping.command === 'R_CCW')) {
        e.preventDefault(); rotateJoystick.setTarget(0);
    }
    if (mapping && (mapping.command === 'CLAW_OPEN' || mapping.command === 'CLAW_CLOSE')) {
        if (activeClawShortcut) {
            activeClawShortcut = false;
            if (clawRepeatTimer) { clearInterval(clawRepeatTimer); clawRepeatTimer = null; }
        }
    }
}

// ==================== 自定义按钮 ====================
const customButtons = [
    { btnId: 'customBtn1', inputId: 'customCmd1', defaultKey: 'N', action: '落子' },
    { btnId: 'customBtn2', inputId: 'customCmd2', defaultKey: 'M', action: '重置' },
    { btnId: 'customBtn3', inputId: 'customCmd3', defaultKey: 'Q', action: '切换游戏' }
];
let customCommands = {};
let customShortcutKeys = {};

function initCustomButtons() {
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
            if (cmd && isConnected) sendCommand(cmd);
        });
    });
    updateCustomShortcuts();
}

function updateCustomShortcuts() {
    customShortcutKeys = {};
    customButtons.forEach(item => {
        const key = customCommands[item.btnId];
        if (key) {
            customShortcutKeys[key] = item.action;
        }
    });
    rebuildKeyMap();
}

// ==================== 蓝牙连接 ====================
document.getElementById('connectBtn').addEventListener('click', async () => {
    if (characteristic) {
        if (device && device.gatt.connected) await device.gatt.disconnect();
        characteristic = null; device = null;
        isConnected = false;
        updateControlsEnabled();
        updateStatus('已断开');
        bluetoothNameSpan.style.display = 'none';
        bluetoothNameSpan.innerText = '';
        document.getElementById('connectBtn').textContent = '🔌 连接蓝牙设备';
        return;
    }
    try {
        updateStatus('请求设备...');
        const SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
        const CHARACTERISTIC_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';
        device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [SERVICE_UUID]
        });
        const deviceName = device.name || '未知设备';
        updateStatus(`已连接 ${deviceName}`);
        bluetoothNameSpan.innerText = `📡 ${deviceName}`;
        bluetoothNameSpan.style.display = 'inline-block';
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(SERVICE_UUID);
        characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);
        await characteristic.startNotifications();
        characteristic.addEventListener('characteristicvaluechanged', handleNotifications);
        isConnected = true;
        updateControlsEnabled();
        updateStatus('连接成功');
        document.getElementById('connectBtn').textContent = '🔌 断开连接';
        device.addEventListener('gattserverdisconnected', () => {
            updateStatus('设备断开');
            characteristic = null; device = null;
            isConnected = false;
            updateControlsEnabled();
            bluetoothNameSpan.style.display = 'none';
            document.getElementById('connectBtn').textContent = '🔌 连接蓝牙设备';
        });
        queryInfo();
    } catch (err) {
        updateStatus(`连接失败: ${err.message}`);
    }
});

// ==================== 速度滑块 ====================
speedSlider.addEventListener('input', (e) => {
    if (!isConnected) return;
    let raw = parseInt(e.target.value);
    let rounded = Math.round(raw / 10) * 10;
    if (rounded !== currentSpeedPercent) {
        setSpeedPercentUI(rounded);
    } else {
        speedSlider.value = rounded;
    }
});
speedSlider.addEventListener('change', (e) => {
    if (!isConnected) return;
    let rounded = Math.round(parseInt(e.target.value) / 10) * 10;
    if (rounded !== currentSpeedPercent) {
        setSpeedPercentUI(rounded);
    }
});

// ==================== 初始化摇杆和事件 ====================
const rotateCallback = (val) => {
    if (!isConnected) return;
    let dir = 'F';
    if (val === -1) dir = 'J';
    else if (val === 1) dir = 'L';
    updateRotateDirection(dir);
};
const clawCallback = (val) => {
    if (!isConnected) return;
    let cmd = 'F';
    if (val === -1) cmd = 'U';
    else if (val === 1) cmd = 'O';
    updateClawCommand(cmd);
};
const rotateJoystick = new HorizontalJoystick(rotateCanvas, rotateCallback);
const clawJoystick = new HorizontalJoystick(clawCanvas, clawCallback);

moveCanvas.addEventListener('mousedown', handleMoveStart);
window.addEventListener('mousemove', handleMoveMove);
window.addEventListener('mouseup', handleMoveEnd);
moveCanvas.addEventListener('touchstart', handleMoveStart);
window.addEventListener('touchmove', handleMoveMove);
window.addEventListener('touchend', handleMoveEnd);

drawMoveJoystick();
setSpeedPercentUI(50);
setMoveTarget(0, 0);
rotateJoystick.setTarget(0);
clawJoystick.setTarget(0);

const stored = localStorage.getItem('robotShortcuts');
if (stored) {
    try { let arr = JSON.parse(stored); if (Array.isArray(arr) && arr.length) currentShortcuts = arr; } catch (e) { }
}
rebuildKeyMap();
renderShortcutTable();
document.getElementById('resetShortcutsBtn').addEventListener('click', resetShortcuts);
window.addEventListener('keydown', handleKeyDown);
window.addEventListener('keyup', handleKeyUp);

initCustomButtons();

isConnected = false;
updateControlsEnabled();

// ==================== 字符发送控制台 ====================
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