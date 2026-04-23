let device = null, characteristic = null;
let isConnected = false;
let receiveBuffer = '';
let addLogCallback = null;
let setSpeedPercentUICallback = null;
let updateStatusCallback = null;
let updateControlsEnabledCallback = null;

export function isBluetoothConnected() { return isConnected; }

// 统一发送方法：自动添加 $ 前缀和 \n 后缀
async function sendFormatted(line) {
    if (!characteristic || !isConnected) return false;
    const payload = `$${line}\n`;
    const encoder = new TextEncoder();
    await characteristic.writeValue(encoder.encode(payload));
    if (addLogCallback) addLogCallback(`📤 ${payload.trim()}`);
    return true;
}

export async function sendCommand(cmd) {
    return sendFormatted(cmd);
}

export async function sendLine(line) {
    return sendFormatted(line);
}

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
    if (addLogCallback) addLogCallback(`📨 ${line}`);
    if (line.startsWith('@speed=')) {
        const speed = parseInt(line.substring(7));
        if (!isNaN(speed) && setSpeedPercentUICallback) {
            const percent = Math.round(speed / 10);
            setSpeedPercentUICallback(percent);
        }
    } else if (line.startsWith('@time=')) {
        const time = line.substring(6);
        if (addLogCallback) addLogCallback(`⏰ 时间: ${time}`);
    } else if (line.startsWith('@date=')) {
        const date = line.substring(6);
        if (addLogCallback) addLogCallback(`📅 日期: ${date}`);
    }
}

async function queryInfo() {
    if (!characteristic || !isConnected) return;
    await sendLine('q -t');
    await sendLine('q -d');
    await sendLine('q -s');
}

export function initBluetooth(addLog, setSpeedPercentUI, updateStatus, updateControlsEnabled) {
    addLogCallback = addLog;
    setSpeedPercentUICallback = setSpeedPercentUI;
    updateStatusCallback = updateStatus;
    updateControlsEnabledCallback = updateControlsEnabled;

    const connectBtn = document.getElementById('connectBtn');
    connectBtn.addEventListener('click', async () => {
        if (characteristic) {
            if (device && device.gatt.connected) await device.gatt.disconnect();
            characteristic = null; device = null;
            isConnected = false;
            if (updateControlsEnabledCallback) updateControlsEnabledCallback(false);
            if (updateStatusCallback) updateStatusCallback('已断开');
            const nameSpan = document.getElementById('bluetoothName');
            nameSpan.style.display = 'none';
            nameSpan.innerText = '';
            connectBtn.textContent = '🔌 连接蓝牙设备';
            return;
        }
        try {
            if (updateStatusCallback) updateStatusCallback('请求设备...');
            const SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
            const CHARACTERISTIC_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';
            device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [SERVICE_UUID]
            });
            const deviceName = device.name || '未知设备';
            if (updateStatusCallback) updateStatusCallback(`已连接 ${deviceName}`);
            const nameSpan = document.getElementById('bluetoothName');
            nameSpan.innerText = `📡 ${deviceName}`;
            nameSpan.style.display = 'inline-block';
            const server = await device.gatt.connect();
            const service = await server.getPrimaryService(SERVICE_UUID);
            characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);
            await characteristic.startNotifications();
            characteristic.addEventListener('characteristicvaluechanged', handleNotifications);
            isConnected = true;
            if (updateControlsEnabledCallback) updateControlsEnabledCallback(true);
            if (updateStatusCallback) updateStatusCallback('连接成功');
            connectBtn.textContent = '🔌 断开连接';
            device.addEventListener('gattserverdisconnected', () => {
                if (updateStatusCallback) updateStatusCallback('设备断开');
                characteristic = null; device = null;
                isConnected = false;
                if (updateControlsEnabledCallback) updateControlsEnabledCallback(false);
                nameSpan.style.display = 'none';
                connectBtn.textContent = '🔌 连接蓝牙设备';
            });
            queryInfo();
        } catch (err) {
            if (updateStatusCallback) updateStatusCallback(`连接失败: ${err.message}`);
        }
    });
}