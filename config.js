// 默认快捷键配置
export const DEFAULT_SHORTCUTS = [
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