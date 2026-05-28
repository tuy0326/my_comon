/*
 * Copyright (c) 2024-2026 My Developer and others
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 */
import * as vscode from 'vscode';
import { exec } from 'child_process';

class SerialMonitorViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'myComon.serialView';

    private _view: vscode.WebviewView | undefined;
    private _serialPort: any = undefined;
    private _isConnected = false;
    private _lineBuffer = '';
    private _logLines: string[] = [];
    private _maxLines = 10000;
    private _pendingLines: string[] = [];
    private _flushTimer: any = undefined;
    private _showTimestamp = true;
    private _viewMode = 'text';
    private _portPath = '';
    private _baudRate = '115200';
    private _lineEnding = '';
    private _filterInclude: string[] = [];
    private _filterExclude: string[] = [];
    private _filterMode: 'off' | 'include' | 'exclude' = 'off';
    private _filterRegex = false;
    private _filterCaseSensitive = false;
    private _filterText = '';
    private _ctx: vscode.ExtensionContext;

    constructor(ctx: vscode.ExtensionContext) {
        this._ctx = ctx;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true
        };

        const customBauds = this._ctx.globalState.get<string[]>('customBauds') || [];
        webviewView.webview.html = this._getHtml(customBauds);

        webviewView.webview.onDidReceiveMessage(async (msg: { command: string; [key: string]: any }) => {
            switch (msg.command) {
                case 'webviewReady':
                    this._restoreState(customBauds);
                    break;
                case 'refreshPorts':
                    await this._refreshPorts();
                    break;
                case 'start':
                    await this._connect(msg.port, msg.baud);
                    break;
                case 'stop':
                    await this._disconnect();
                    break;
                case 'clear':
                    this._logLines = [];
                    this._post({ command: 'clearLog' });
                    break;
                case 'send':
                    await this._send(msg.text, msg.hexMode === true);
                    break;
                case 'changeViewMode':
                    this._viewMode = msg.mode;
                    this._post({ command: 'redrawLog', lines: this._formatLines(this._logLines) });
                    break;
                case 'toggleTimestamp':
                    this._showTimestamp = !this._showTimestamp;
                    this._post({ command: 'redrawLog', lines: this._formatLines(this._logLines) });
                    this._post({ command: 'setTimestampState', enabled: this._showTimestamp });
                    break;
                case 'setFilter':
                    this._filterText = msg.text || '';
                    break;
                case 'setFilterMode':
                    this._filterMode = msg.mode;
                    this._post({ command: 'redrawLog', lines: this._formatLines(this._logLines) });
                    break;
                case 'addFilterInclude':
                    if (msg.text && !this._filterInclude.includes(msg.text)) {
                        this._filterInclude.push(msg.text);
                    }
                    this._applyFilter();
                    break;
                case 'addFilterExclude':
                    if (msg.text && !this._filterExclude.includes(msg.text)) {
                        this._filterExclude.push(msg.text);
                    }
                    this._applyFilter();
                    break;
                case 'removeFilterInclude':
                    this._filterInclude.splice(msg.index, 1);
                    this._applyFilter();
                    break;
                case 'removeFilterExclude':
                    this._filterExclude.splice(msg.index, 1);
                    this._applyFilter();
                    break;
                case 'clearFilters':
                    this._filterInclude = [];
                    this._filterExclude = [];
                    this._filterText = '';
                    this._filterMode = 'off';
                    this._post({ command: 'redrawLog', lines: this._formatLines(this._logLines) });
                    this._post({ command: 'filterState', include: [], exclude: [], mode: 'off', text: '' });
                    break;
                case 'customBaud':
                    await this._customBaud();
                    break;
                case 'removeCustomBaud':
                    await this._removeCustomBaud();
                    break;
            }
        });
    }

    private _post(msg: object) {
        this._view?.webview.postMessage(msg);
    }

    private _restoreState(customBauds: string[]) {
        if (this._isConnected && this._serialPort) {
            this._post({ command: 'setConnected', port: this._portPath, baud: this._baudRate });
        }
        if (this._logLines.length > 0) {
            this._post({ command: 'redrawLog', lines: this._formatLines(this._logLines) });
        }
        this._post({ command: 'setTimestampState', enabled: this._showTimestamp });
        this._post({ command: 'setViewMode', mode: this._viewMode });
        if (this._filterMode !== 'off' || this._filterText) {
            this._post({ command: 'filterState', include: this._filterInclude, exclude: this._filterExclude, mode: this._filterMode, text: this._filterText });
        }
        if (customBauds.length > 0) {
            this._post({ command: 'setCustomBauds', bauds: customBauds });
        }
        this._refreshPorts();
    }

    private async _customBaud() {
        const baud = await vscode.window.showInputBox({
            prompt: 'Enter custom baud rate',
            validateInput: (v) => {
                const n = parseInt(v);
                return (isNaN(n) || n <= 0) ? 'Please enter a valid positive number' : undefined;
            }
        });
        if (!baud) return;
        const customBauds = this._ctx.globalState.get<string[]>('customBauds') || [];
        if (!customBauds.includes(baud)) {
            customBauds.push(baud);
            await this._ctx.globalState.update('customBauds', customBauds);
        }
        this._post({ command: 'setCustomBauds', bauds: customBauds, select: baud });
    }

    private async _removeCustomBaud() {
        const customBauds = this._ctx.globalState.get<string[]>('customBauds') || [];
        if (customBauds.length === 0) {
            vscode.window.showInformationMessage('No custom baud rates to remove');
            return;
        }
        const picked = await vscode.window.showQuickPick(
            customBauds.map(b => ({ label: b })),
            { placeHolder: 'Select custom baud rate to remove' }
        );
        if (!picked) return;
        const updated = customBauds.filter(b => b !== picked.label);
        await this._ctx.globalState.update('customBauds', updated);
        this._post({ command: 'removeCustomBaudOption', baud: picked.label });
    }

    private async _refreshPorts() {
        try {
            const { SerialPort } = require('serialport');
            const ports = await SerialPort.list();
            const friendlyNames = await this._getFriendlyNames();
            const portList = ports.length > 0
                ? ports.map((p: any) => ({
                    path: p.path,
                    manufacturer: p.manufacturer || '',
                    serialNumber: p.serialNumber || '',
                    friendlyName: friendlyNames.get(p.path.toUpperCase()) || ''
                }))
                : [];
            this._post({ command: 'setPorts', ports: portList });
            if (portList.length > 0) {
                this._post({ command: 'selectFirstPort' });
            }
        } catch (e) {
            this._post({ command: 'setError', text: 'Failed to enumerate ports: ' + (e as Error).message });
        }
    }

    private _getFriendlyNames(): Promise<Map<string, string>> {
        return new Promise((resolve) => {
            const cmd = 'powershell -NoProfile -Command "Get-PnpDevice -Class Ports -Status OK | ForEach-Object { $_.FriendlyName }"';
            exec(cmd, { timeout: 8000 }, (err, stdout) => {
                const map = new Map<string, string>();
                if (err || !stdout) { resolve(map); return; }
                for (const line of stdout.split('\n')) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    const match = trimmed.match(/\((COM\d+)\)/i);
                    if (match) {
                        map.set(match[1].toUpperCase(), trimmed);
                    }
                }
                resolve(map);
            });
        });
    }

    private async _connect(portPath: string, baudRate: string) {
        if (this._isConnected) {
            await this._disconnect();
        }

        if (!portPath) {
            this._post({ command: 'setError', text: 'Please select a port first' });
            return;
        }

        this._portPath = portPath;
        this._baudRate = baudRate;

        try {
            const { SerialPort } = require('serialport');
            this._serialPort = new SerialPort({
                path: portPath,
                baudRate: parseInt(baudRate),
                dataBits: 8,
                parity: 'none',
                stopBits: 1
            });

            this._serialPort.on('open', () => {
                this._isConnected = true;
                this._post({ command: 'setConnected', port: portPath, baud: baudRate });
            });

            this._serialPort.on('data', (data: Uint8Array) => {
                const text = new TextDecoder().decode(data);
                this._lineBuffer += text;
                let idx: number;
                while ((idx = this._lineBuffer.indexOf('\n')) >= 0) {
                    const line = this._lineBuffer.substring(0, idx).replace(/\r$/, '');
                    this._lineBuffer = this._lineBuffer.substring(idx + 1);
                    if (line.length > 0) {
                        this._addLine(line);
                    }
                }
            });

            this._serialPort.on('error', (err: Error) => {
                this._post({ command: 'setError', text: 'Serial error: ' + err.message });
                this._disconnect();
            });

            this._serialPort.on('close', () => {
                if (this._isConnected) {
                    this._isConnected = false;
                    this._serialPort = undefined;
                    this._post({ command: 'setDisconnected' });
                }
            });

        } catch (e) {
            this._post({ command: 'setError', text: 'Failed to open port: ' + (e as Error).message });
        }
    }

    private async _disconnect() {
        if (this._serialPort) {
            try {
                if (this._serialPort.isOpen) {
                    this._serialPort.close();
                }
            } catch (e) {
            }
            this._serialPort = undefined;
        }
        this._isConnected = false;
        if (this._lineBuffer.length > 0) {
            this._addLine(this._lineBuffer);
            this._lineBuffer = '';
        }
        this._post({ command: 'setDisconnected' });
    }

    private async _send(text: string, hexMode = false) {
        if (!this._serialPort || !this._isConnected) {
            return;
        }
        try {
            let data: Buffer | string;
            if (hexMode) {
                const hexStr = text.replace(/\s+/g, '');
                if (!/^[0-9a-fA-F]*$/.test(hexStr) || hexStr.length % 2 !== 0) {
                    this._post({ command: 'setError', text: 'Invalid hex string (must be pairs like AA BB CC)' });
                    return;
                }
                data = Buffer.from(hexStr, 'hex');
            } else {
                data = text;
            }
            if (this._lineEnding === '\\n') {
                if (typeof data === 'string') data += '\n'; else data = Buffer.concat([data, Buffer.from('\n')]);
            } else if (this._lineEnding === '\\r') {
                if (typeof data === 'string') data += '\r'; else data = Buffer.concat([data, Buffer.from('\r')]);
            } else if (this._lineEnding === '\\r\\n') {
                if (typeof data === 'string') data += '\r\n'; else data = Buffer.concat([data, Buffer.from('\r\n')]);
            }
            this._serialPort.write(data);
        } catch (e) {
            this._post({ command: 'setError', text: 'Send failed: ' + (e as Error).message });
        }
    }

    private _addLine(text: string) {
        if (this._logLines.length >= this._maxLines) {
            this._logLines.splice(0, 500);
            this._post({ command: 'trimLogTop', count: 500 });
        }
        this._logLines.push(text);
        if (!this._matchesFilter(text)) return;
        this._pendingLines.push(this._formatLine(text));
        if (!this._flushTimer) {
            this._flushTimer = setTimeout(() => {
                const lines = this._pendingLines;
                this._pendingLines = [];
                this._flushTimer = undefined;
                if (lines.length > 0) {
                    this._post({ command: 'appendLines', lines: lines });
                }
            }, 60);
        }
    }

    private _formatLine(text: string): string {
        const ts = this._showTimestamp ? '<span class="ts">' + this._timestamp() + '</span> ' : '';
        if (this._viewMode === 'hex') {
            const hex = Array.from(new TextEncoder().encode(text))
                .map(b => b.toString(16).padStart(2, ' ').toUpperCase())
                .join(' ');
            return ts + '<span class="data">' + hex + '</span>';
        }
        return ts + '<span class="data">' + this._escapeHtml(text) + '</span>';
    }

    private _formatLines(lines: string[]): string[] {
        return lines.filter(l => this._matchesFilter(l)).map(l => this._formatLine(l));
    }

    private _timestamp(): string {
        const now = new Date();
        return '[' + now.toLocaleTimeString('en-US', { hour12: false }) + '.' +
            String(now.getMilliseconds()).padStart(3, '0') + ']';
    }

    private _escapeHtml(s: string): string {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    private _matchesFilter(text: string): boolean {
        if (this._filterMode === 'off') return true;
        const patterns = this._filterMode === 'include' ? this._filterInclude : this._filterExclude;
        if (patterns.length === 0) {
            if (!this._filterText) return true;
            return this._matchOne(text, this._filterText);
        }
        const hit = patterns.some(p => this._matchOne(text, p));
        return this._filterMode === 'include' ? hit : !hit;
    }

    private _matchOne(text: string, pattern: string): boolean {
        if (this._filterRegex) {
            try {
                const flags = this._filterCaseSensitive ? 'i' : '';
                return new RegExp(pattern, flags).test(text);
            } catch { return false; }
        }
        const t = this._filterCaseSensitive ? text : text.toLowerCase();
        const p = this._filterCaseSensitive ? pattern : pattern.toLowerCase();
        return t.includes(p);
    }

    private _applyFilter() {
        this._post({ command: 'redrawLog', lines: this._formatLines(this._logLines) });
        this._post({ command: 'filterState', include: this._filterInclude, exclude: this._filterExclude, mode: this._filterMode, text: this._filterText });
    }

    private _getHtml(customBauds: string[]): string {
        const baudOptions = [
            '300', '1200', '2400', '4800', '9600', '19200', '38400', '57600',
            '115200', '230400', '460800', '921600'
        ];
        const allBauds = [...baudOptions, ...customBauds];
        const baudOpts = allBauds.map(b =>
            '<option value="' + b + '"' + (b === '115200' ? ' selected' : '') + '>' + b + '</option>'
        ).join('\n    ');

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: var(--vscode-panel-background, #1e1e1e); color: var(--vscode-foreground, #ccc); font-family: var(--vscode-font-family, sans-serif); font-size: 13px; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
  .toolbar { display: flex; align-items: center; gap: 5px; padding: 4px 8px; background: var(--vscode-panel-background, #1e1e1e); border-bottom: 1px solid var(--vscode-panel-border, #444); flex-shrink: 0; flex-wrap: wrap; }
  .toolbar label { font-size: 11px; color: var(--vscode-foreground, #ccc) !important; opacity: 0.9; font-weight: 500; }
  .toolbar select { background: var(--vscode-input-background, #3c3c3c); color: var(--vscode-input-foreground, #ccc) !important; border: 1px solid var(--vscode-input-border, #3c3c3c); border-radius: 3px; padding: 2px 6px; font-size: 12px; min-width: 70px; }
  .toolbar select option { color: #1e1e1e !important; background: #ffffff !important; }
  .toolbar select:focus { outline: 1px solid var(--vscode-focusBorder); }
  .toolbar button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 3px; padding: 3px 10px; font-size: 12px; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 3px; }
  .toolbar button:hover { background: var(--vscode-button-hoverBackground); }
  .toolbar button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); font-size: 13px; padding: 2px 7px; }
  .toolbar button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .toolbar button.active { outline: 1px solid var(--vscode-focusBorder); }
  .filter-input { background: var(--vscode-input-background, #3c3c3c); color: var(--vscode-input-foreground, #ccc) !important; border: 1px solid var(--vscode-input-border, #3c3c3c); border-radius: 3px; padding: 2px 6px; font-size: 12px; width: 120px; }
  .filter-input:focus { outline: 1px solid var(--vscode-focusBorder); }
  .filter-input::placeholder { color: var(--vscode-input-placeholderForeground, #555); }
  .sep { width: 1px; height: 18px; background: var(--vscode-panel-border); margin: 0 2px; }
  #log { flex: 1; overflow-y: auto; padding: 4px 8px; font-family: var(--vscode-editor-font-family, 'Consolas', monospace); font-size: var(--vscode-editor-font-size, 12px); line-height: 1.4; white-space: pre-wrap; word-break: break-all; color: #4EC9B0 !important; }
  #log div, #log span { color: #4EC9B0 !important; }
  #log .placeholder { color: var(--vscode-descriptionForeground) !important; font-style: italic; text-align: center; padding: 40px 20px; }
  #log .err { color: #f14c4c !important; }
  #log .ts { color: #608B4E !important; opacity: 0.85; }
  #log .data { color: #4EC9B0 !important; }
  .statusbar { padding: 2px 8px; font-size: 11px; border-top: 1px solid var(--vscode-panel-border); display: flex; justify-content: space-between; flex-shrink: 0; }
  .statusbar .left { opacity: 0.8; }
  .statusbar .right { opacity: 0.6; }
  .hidden { display: none !important; }
  .sendbar { display: flex; align-items: center; gap: 4px; padding: 2px 8px; border-top: 1px solid var(--vscode-panel-border); flex-shrink: 0; }
  .sendbar input { flex: 1; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 3px; padding: 2px 6px; font-size: 12px; font-family: var(--vscode-editor-font-family, 'Consolas', monospace); }
  .sendbar input:focus { outline: 1px solid var(--vscode-focusBorder); }
</style>
</head>
<body>
<div class="toolbar">
  <label>Port</label>
  <select id="port"></select>
  <button class="secondary" onclick="doRefreshPorts()" title="Refresh">&#x21BB;</button>
  <div class="sep"></div>
  <label>Baud</label>
  <select id="baud">
    ${baudOpts}
  </select>
  <button class="secondary" onclick="doCustomBaud()" title="Add custom baud rate">+</button>
  <button class="secondary" onclick="doRemoveCustomBaud()" title="Remove custom baud rate">-</button>
  <div class="sep"></div>
  <label>EOL</label>
  <select id="eol">
    <option value="">None</option>
    <option value="\\n">LF</option>
    <option value="\\r">CR</option>
    <option value="\\r\\n">CRLF</option>
  </select>
  <div class="sep"></div>
  <button id="viewToggle" class="secondary icon" onclick="toggleViewMode()" title="Toggle Text/Hex view"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3h14v1.5H1zm0 4h9v1.5H1zm0 4h5v1.5H1z"/></svg></button>
  <div class="sep"></div>
  <button id="tsBtn" class="secondary icon" onclick="toggleTs()" title="Timestamp"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm7.25-3.75h1.5v3.69l2.53 2.53-1.06 1.06-2.97-2.97V4.25z"/></svg></button>
  <div class="sep"></div>
  <input id="filterInput" class="filter-input" placeholder="Filter..." oninput="onFilterInput(this.value)" />
  <button id="filterModeBtn" class="secondary icon" onclick="cycleFilterMode()" title="Filter: OFF"><svg id="filterOff" width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 2h13l-5 6v5l-3 1.5V8z"/></svg></button>
  <button class="secondary icon" onclick="showFilterPanel()" title="Save filter rule"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M13.5 1.5h-11l-.5.5v12l.85.35L8 10.5l5.15 3.85.85-.35V2z"/></svg></button>
  <div class="sep"></div>
  <button id="startBtn" class="icon" onclick="doStart()" title="Start"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11l9-5.5z"/></svg></button>
  <button id="stopBtn" class="secondary icon hidden" onclick="doStop()" title="Stop"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="1"/></svg></button>
  <button class="secondary icon" onclick="doClear()" title="Clear"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M11 2L10 1H6L5 2H2v1h12V2h-3zM3.5 5l.67 9.67 1 .33h5.66l1-.33L12.5 5h-9zm5.75 8H6.75L6.1 6.5h3.8L9.25 13z"/></svg></button>
</div>
<div id="log">
  <div class="placeholder" id="ph">Select a port and click Start to begin monitoring</div>
</div>
<div class="sendbar">
  <input id="sendInput" placeholder="Send text to serial port..." onkeydown="if(event.key==='Enter')doSend()" />
  <button class="secondary" onclick="doSend()">Send</button>
</div>
<div class="statusbar">
  <span class="left" id="status">&#x25CB; Disconnected</span>
  <span class="right" id="info">--</span>
</div>
<script>
const vscode = acquireVsCodeApi();
let connected = false;
let viewMode = 'text';
let filterMode = 'off';
let filterInclude = [];
let filterExclude = [];

function doRefreshPorts() {
  vscode.postMessage({ command: 'refreshPorts' });
}

function doStart() {
  const port = document.getElementById('port').value;
  const baud = document.getElementById('baud').value;
  if (!port) { vscode.postMessage({ command: 'refreshPorts' }); return; }
  vscode.postMessage({ command: 'start', port: port, baud: baud });
}

function doStop() {
  vscode.postMessage({ command: 'stop' });
}

function doClear() {
  vscode.postMessage({ command: 'clear' });
}

function doSend() {
  const input = document.getElementById('sendInput');
  const text = input.value;
  if (text.length === 0) return;
  vscode.postMessage({ command: 'send', text: text, hexMode: viewMode === 'hex' });
  input.value = '';
}

function doCustomBaud() {
  vscode.postMessage({ command: 'customBaud' });
}

function doRemoveCustomBaud() {
  vscode.postMessage({ command: 'removeCustomBaud' });
}

function toggleViewMode() {
  viewMode = viewMode === 'text' ? 'hex' : 'text';
  var inp = document.getElementById('sendInput');
  if (viewMode === 'text') {
    document.getElementById('viewToggle').innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3h14v1.5H1zm0 4h9v1.5H1zm0 4h5v1.5H1z"/></svg>';
    inp.placeholder = 'Send text to serial port...';
  } else {
    document.getElementById('viewToggle').innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 3h1v1.5H4zm2 0h6v1.5H6zM4 6h1v1.5H4zm2 0h6v1.5H6zM4 9h1v1.5H4zm2 0h6v1.5H6zM4 12h1v1.5H4zm2 0h6v1.5H6z"/></svg>';
    inp.placeholder = 'Send hex to serial port (e.g. AA BB CC)...';
  }
  vscode.postMessage({ command: 'changeViewMode', mode: viewMode });
}

function onFilterInput(val) {
  vscode.postMessage({ command: 'setFilter', text: val });
}

function cycleFilterMode() {
  const modes = ['off', 'include', 'exclude'];
  const svgs = {
    off: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 2h13l-5 6v5l-3 1.5V8z"/></svg>',
    include: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 2h13l-5 6v5l-3 1.5V8z" opacity="0.4"/><path d="M6 7h4v1.5H6zm1.5 2.5h1V14h-1z" opacity="1"/></svg>',
    exclude: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 2h13l-5 6v5l-3 1.5V8z" opacity="0.4"/><path d="M5.5 7.8l1.06-1.06 4 4-1.06 1.06z" opacity="1"/></svg>'
  };
  const titles = { off: 'Filter: OFF', include: 'Filter: Include', exclude: 'Filter: Exclude' };
  const idx = modes.indexOf(filterMode);
  filterMode = modes[(idx + 1) % 3];
  const btn = document.getElementById('filterModeBtn');
  btn.innerHTML = svgs[filterMode];
  btn.title = titles[filterMode];
  vscode.postMessage({ command: 'setFilterMode', mode: filterMode });
}

function showFilterPanel() {
  const text = document.getElementById('filterInput').value;
  if (!text) return;
  const action = filterMode === 'exclude' ? 'addFilterExclude' : 'addFilterInclude';
  vscode.postMessage({ command: action, text: text });
}

function toggleTs() {
  vscode.postMessage({ command: 'toggleTimestamp' });
}

function updateInfo() {
  const baud = document.getElementById('baud').value;
  const port = document.getElementById('port').value || '--';
  const conn = connected ? 'Connected' : 'Disconnected';
  document.getElementById('info').textContent = baud + ' bps | ' + port + ' | ' + conn;
}

window.addEventListener('message', event => {
  const msg = event.data;
  switch (msg.command) {
    case 'setConnected':
      connected = true;
      document.getElementById('status').textContent = '\\u25CF Connected: ' + msg.port + ' @ ' + msg.baud;
      document.getElementById('startBtn').classList.add('hidden');
      document.getElementById('stopBtn').classList.remove('hidden');
      removePlaceholder();
      updateInfo();
      break;
    case 'setDisconnected':
      connected = false;
      document.getElementById('status').textContent = '\\u25CB Disconnected';
      document.getElementById('startBtn').classList.remove('hidden');
      document.getElementById('stopBtn').classList.add('hidden');
      updateInfo();
      break;
    case 'setError':
      appendToLog('<span class="err">' + escapeHtml(msg.text) + '</span>');
      break;
    case 'setPorts': {
      const sel = document.getElementById('port');
      const prev = sel.value;
      sel.innerHTML = '';
      for (const p of msg.ports) {
        const opt = document.createElement('option');
        opt.value = p.path;
        const displayName = p.friendlyName ? (p.path + ' - ' + p.friendlyName) : p.path;
        opt.textContent = displayName;
        sel.appendChild(opt);
      }
      if (prev) {
        let found = false;
        for (const opt of sel.options) { if (opt.value === prev) { found = true; break; } }
        if (found) sel.value = prev;
      }
      if (!sel.value && msg.ports.length > 0) sel.selectedIndex = 0;
      updateInfo();
      break;
    }
    case 'selectFirstPort': {
      const sel = document.getElementById('port');
      if (sel.options.length > 0 && !sel.value) {
        sel.selectedIndex = 0;
        updateInfo();
      }
      break;
    }
    case 'appendLines': {
      const log = document.getElementById('log');
      removePlaceholder();
      const frag = document.createDocumentFragment();
      for (const l of msg.lines) {
        const div = document.createElement('div');
        div.innerHTML = l;
        frag.appendChild(div);
      }
      log.appendChild(frag);
      const maxDom = 3000;
      while (log.children.length > maxDom) log.removeChild(log.firstChild);
      scrollLog();
      break;
    }
    case 'appendLine':
      appendToLog(msg.line);
      break;
    case 'clearLog':
      document.getElementById('log').innerHTML = '';
      break;
    case 'trimLogTop': {
      const log = document.getElementById('log');
      for (let i = 0; i < msg.count; i++) { if (log.firstChild) log.removeChild(log.firstChild); }
      break;
    }
    case 'redrawLog': {
      const log = document.getElementById('log');
      log.innerHTML = msg.lines.map(l => '<div>' + l + '</div>').join('');
      scrollLog();
      break;
    }
    case 'setTimestampState':
      document.getElementById('tsBtn').classList.toggle('active', msg.enabled);
      break;
    case 'setViewMode':
      viewMode = msg.mode;
      var inp = document.getElementById('sendInput');
      if (viewMode === 'hex') {
        document.getElementById('viewToggle').innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 3h1v1.5H4zm2 0h6v1.5H6zM4 6h1v1.5H4zm2 0h6v1.5H6zM4 9h1v1.5H4zm2 0h6v1.5H6zM4 12h1v1.5H4zm2 0h6v1.5H6z"/></svg>';
        inp.placeholder = 'Send hex to serial port (e.g. AA BB CC)...';
      }
      break;
    case 'filterState':
      filterInclude = msg.include || [];
      filterExclude = msg.exclude || [];
      filterMode = msg.mode || 'off';
      document.getElementById('filterInput').value = msg.text || '';
      const labels = { off: 'OFF', include: 'INC', exclude: 'EXC' };
      document.getElementById('filterModeBtn').textContent = labels[filterMode];
      break;
    case 'setCustomBauds': {
      const sel = document.getElementById('baud');
      const preset = ['300','1200','2400','4800','9600','19200','38400','57600','115200','230400','460800','921600'];
      const existing = new Set();
      for (const opt of sel.options) existing.add(opt.value);
      for (const b of msg.bauds) {
        if (!existing.has(b) && !preset.includes(b)) {
          const opt = document.createElement('option');
          opt.value = b;
          opt.textContent = b + ' *';
          sel.appendChild(opt);
        }
      }
      if (msg.select) sel.value = msg.select;
      break;
    }
    case 'removeCustomBaudOption': {
      const sel = document.getElementById('baud');
      for (let i = sel.options.length - 1; i >= 0; i--) {
        if (sel.options[i].value === msg.baud) {
          sel.remove(i);
          break;
        }
      }
      sel.value = '115200';
      updateInfo();
      break;
    }
  }
});

function removePlaceholder() {
  const ph = document.getElementById('ph');
  if (ph) ph.remove();
}

function appendToLog(html) {
  const log = document.getElementById('log');
  removePlaceholder();
  const div = document.createElement('div');
  div.innerHTML = html;
  log.appendChild(div);
  while (log.children.length > 3000) log.removeChild(log.firstChild);
  scrollLog();
}

function scrollLog() {
  const log = document.getElementById('log');
  log.scrollTop = log.scrollHeight;
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

document.getElementById('baud').addEventListener('change', updateInfo);
document.getElementById('port').addEventListener('change', updateInfo);

document.getElementById('log').addEventListener('mouseup', function() {
  const sel = window.getSelection();
  if (sel && sel.toString().length > 0) {
    navigator.clipboard.writeText(sel.toString());
  }
});

document.getElementById('log').addEventListener('dblclick', function(e) {
  const range = document.createRange();
  const target = e.target;
  if (target && target.nodeType === Node.TEXT_NODE) {
    const text = target.textContent || '';
    const words = text.split(/\\s+/);
    let offset = 0;
    for (const word of words) {
      const start = text.indexOf(word, offset);
      if (start <= e.offsetX && e.offsetX <= start + word.length) {
        range.setStart(target, start);
        range.setEnd(target, start + word.length);
        break;
      }
      offset = start + word.length;
    }
    if (range.collapsed) {
      range.selectNodeContents(target.parentNode || target);
    }
  } else if (target && target instanceof HTMLElement) {
    range.selectNodeContents(target);
  }
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(range);
    navigator.clipboard.writeText(sel.toString());
  }
});

vscode.postMessage({ command: 'webviewReady' });
</script>
</body>
</html>`;
    }
}

export const activate = (context: vscode.ExtensionContext) => {
    const provider = new SerialMonitorViewProvider(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            SerialMonitorViewProvider.viewType,
            provider
        )
    );
};

export const deactivate = () => {};
