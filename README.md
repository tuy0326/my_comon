# My Comon - Serial Monitor

VS Code 串口监视器扩展，底部面板嵌入，支持实时日志过滤和 HEX 收发。

Based on [Eclipse CDT Cloud Serial Monitor](https://github.com/eclipse-cdt-cloud/vscode-serial-monitor).

## Features

- **底部面板嵌入** — 与终端同级，不占用编辑器标签页
- **串口管理** — 自动枚举端口（显示设备友好名称）、自定义波特率、数据位/停止位/奇偶校验
- **实时收发** — 文本/HEX 模式切换，HEX 发送（如 `AA BB CC`）
- **时间戳** — 可开关的毫秒级时间戳 `[HH:mm:ss.SSS]`
- **日志过滤** — 支持包含/排除模式，可保存过滤规则
- **自动复制** — 鼠标选择即复制到剪贴板
- **行缓冲** — 按完整行输出，不因串口分片截断日志

## Usage

1. 安装扩展后，在 VS Code 底部面板找到 **My Comon**
2. 选择串口和波特率，点击 ▶ Start
3. 在底部输入框发送数据，切换 HEX 模式发送十六进制
4. 使用过滤框和模式按钮过滤日志

## Toolbar

| Button | Function |
|--------|----------|
| ▶ / ■ | Start / Stop |
| 🗑 | Clear log |
| 📋 | Toggle timestamp |
| ABC / # | Text / Hex view toggle |
| 🔍 | Filter input |
| OFF / INC / EXC | Filter mode cycle |
| 💾 | Save filter rule |

## Settings

| Key | Description | Default |
|-----|-------------|---------|
| `serial-monitor.defaultBaud` | Default baud rate | `115200` |
| `serial-monitor.maxLogLines` | Max log lines | `10000` |
| `serial-monitor.showTimestamp` | Show timestamp | `true` |

## Requirements

- VS Code >= 1.120.0
- Windows (uses `serialport` native module)

## License

[Eclipse Public License 2.0](LICENSE)

Original project: Eclipse CDT Cloud Serial Monitor
https://github.com/eclipse-cdt-cloud/vscode-serial-monitor
