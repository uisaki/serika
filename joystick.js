import { sendCommand } from './bluetooth.js';

// ---------- 移动摇杆（圆形，二维）----------
const moveCanvas = document.getElementById('moveCanvas');
const ctxMove = moveCanvas.getContext('2d');
const MOVE_SIZE = moveCanvas.width;
const MOVE_MAX_RADIUS = MOVE_SIZE * 0.4;
const MOVE_CX = MOVE_SIZE / 2, MOVE_CY = MOVE_SIZE / 2;
const MOVE_RADIUS = MOVE_SIZE * 0.42;
const MOVE_HANDLE_RADIUS = MOVE_RADIUS * 0.35;

let moveTargetX = 0, moveTargetY = 0, moveCurrentX = 0, moveCurrentY = 0;
let moveAnimFrame = null;
let moveActive = false;
let moveDragged = false;
let updateMoveDirectionCallback = null;

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

export function setMoveTarget(nx, ny) {
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
    if (updateMoveDirectionCallback) updateMoveDirectionCallback(dir);
}

function isPointInCanvas(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right &&
           clientY >= rect.top && clientY <= rect.bottom;
}

function handleMoveStart(e) {
    e.preventDefault();
    moveActive = true;
    moveDragged = false;
    handleMoveMove(e);
}

function handleMoveMove(e) {
    if (!moveActive) return;
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

// ---------- 水平摇杆（一维，用于旋转和机械爪）----------
export class HorizontalJoystick {
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
        e.preventDefault();
        this.active = true;
        this.dragged = false;
        this.move(e);
    }
    move(e) {
        if (!this.active) return;
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

// ---------- 初始化所有摇杆 ----------
export function initJoysticks(updateMoveDirection, updateRotateDirection, updateClawCommand) {
    updateMoveDirectionCallback = updateMoveDirection;

    moveCanvas.addEventListener('mousedown', handleMoveStart);
    window.addEventListener('mousemove', handleMoveMove);
    window.addEventListener('mouseup', handleMoveEnd);
    moveCanvas.addEventListener('touchstart', handleMoveStart);
    window.addEventListener('touchmove', handleMoveMove);
    window.addEventListener('touchend', handleMoveEnd);

    const rotateCanvas = document.getElementById('rotateCanvas');
    const clawCanvas = document.getElementById('clawCanvas');

    const rotateCallback = (val) => {
        if (!window.isBluetoothConnected?.()) return;
        let dir = 'F';
        if (val === -1) dir = 'J';
        else if (val === 1) dir = 'L';
        updateRotateDirection(dir);
    };
    const rotateJoystick = new HorizontalJoystick(rotateCanvas, rotateCallback);

    const clawCallback = (val) => {
        if (!window.isBluetoothConnected?.()) return;
        let cmd = 'F';
        if (val === -1) cmd = 'U';
        else if (val === 1) cmd = 'O';
        updateClawCommand(cmd);
    };
    const clawJoystick = new HorizontalJoystick(clawCanvas, clawCallback);

    drawMoveJoystick();
    setMoveTarget(0, 0);
    rotateJoystick.setTarget(0);
    clawJoystick.setTarget(0);

    return { rotateJoystick, clawJoystick };
}