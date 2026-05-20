/*
 * Copyright (c) 2024-2026 My Developer and others
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 */
import * as vscode from 'vscode';
import { FilterConfig, LogLevel, FilterRule, LogEntry } from './types';
import { FilterEngine } from './engine';

export class FilterPanel {
    private filterEngine: FilterEngine;
    private panel: vscode.WebviewPanel | undefined;
    private config: FilterConfig;
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext, maxHistory: number = 10000) {
        this.context = context;
        this.filterEngine = new FilterEngine(maxHistory);
        this.config = {
            include: [],
            exclude: [],
            levels: Object.values(LogLevel),
            useRegex: false,
            caseSensitive: false
        };
    }

    public getFilterEngine(): FilterEngine {
        return this.filterEngine;
    }

    public createOrShow(context: vscode.ExtensionContext): void {
        // Check if panel already exists
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.context = context;

        // Create webview panel
        this.panel = vscode.window.createWebviewPanel(
            'serialMonitorFilter',
            'Log Filter / 日志过滤',
            vscode.ViewColumn.One,
            {
                retainContextWhenHidden: true
            }
        );

        this.panel.webview.onDidReceiveMessage(
            (message: any) => {
                this.handleMessage(message);
            },
            undefined,
            context.subscriptions
        );

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        this.updateWebview();
    }

    private async handleMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'updateConfig':
                this.config = message.config;
                this.filterEngine.applyFilters(this.config);
                break;
            case 'clear':
                this.filterEngine.clearFilters();
                this.config = {
                    include: [],
                    exclude: [],
                    levels: Object.values(LogLevel),
                    useRegex: false,
                    caseSensitive: false
                };
                this.updateWebview();
                break;
            case 'addInclude':
                if (!this.config.include.includes(message.pattern)) {
                    this.config.include.push(message.pattern);
                    this.filterEngine.applyFilters(this.config);
                    this.updateWebview();
                }
                break;
            case 'addExclude':
                if (!this.config.exclude.includes(message.pattern)) {
                    this.config.exclude.push(message.pattern);
                    this.filterEngine.applyFilters(this.config);
                    this.updateWebview();
                }
                break;
            case 'removeInclude':
                this.config.include = this.config.include.filter((_, i) => i !== message.index);
                this.filterEngine.applyFilters(this.config);
                this.updateWebview();
                break;
            case 'removeExclude':
                this.config.exclude = this.config.exclude.filter((_, i) => i !== message.index);
                this.filterEngine.applyFilters(this.config);
                this.updateWebview();
                break;
            case 'search':
                const results = this.filterEngine.searchHistory(message.pattern, message.limit);
                this.showSearchResults(results);
                break;
            case 'export':
                this.exportLogs();
                break;
            case 'toggleLevel':
                const level = message.level as LogLevel;
                const index = this.config.levels.indexOf(level);
                if (index >= 0) {
                    this.config.levels.splice(index, 1);
                } else {
                    this.config.levels.push(level);
                }
                this.filterEngine.applyFilters(this.config);
                this.updateWebview();
                break;
        }
    }

    private updateWebview(): void {
        if (!this.panel) return;

        const html = this.generateHtml();
        this.panel.webview.html = html;
    }

    private generateHtml(): string {
        const config = JSON.stringify(this.config);
        const levels = JSON.stringify(Object.values(LogLevel));
        
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            padding: 20px;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        .section {
            margin-bottom: 20px;
            padding: 15px;
            border: 1px solid #ddd;
            border-radius: 5px;
        }
        .section-title {
            font-size: 1.2em;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .form-group {
            margin-bottom: 15px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        input[type="text"] {
            width: 100%;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 3px;
            box-sizing: border-box;
        }
        button {
            padding: 8px 16px;
            background-color: #0078d4;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            margin-right: 5px;
            margin-top: 5px;
        }
        button:hover {
            background-color: #005a9e;
        }
        button.danger {
            background-color: #d32f2f;
        }
        button.danger:hover {
            background-color: #b71c1c;
        }
        .pattern-list {
            list-style: none;
            padding: 0;
        }
        .pattern-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 5px;
            margin-bottom: 5px;
            background: #f5f5f5;
            border-radius: 3px;
        }
        .pattern-item button {
            padding: 4px 8px;
            font-size: 0.8em;
        }
        .checkbox-group {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
        }
        .checkbox-item {
            display: flex;
            align-items: center;
        }
        .checkbox-item input {
            margin-right: 5px;
        }
        .info-text {
            color: #666;
            font-size: 0.9em;
            margin-top: 5px;
        }
    </style>
</head>
<body>
    <h2>Log Filter / 日志过滤</h2>
    
    <div class="section">
        <div class="section-title">Log Levels / 日志级别</div>
        <div class="form-group">
            <label>Show log levels (显示级别):</label>
            <div class="checkbox-group" id="levelCheckboxes"></div>
        </div>
    </div>

    <div class="section">
        <div class="section-title">Include Filters / 包含过滤</div>
        <div class="form-group">
            <label>Add Include Pattern (添加包含规则):</label>
            <div style="display: flex; gap: 5px;">
                <input type="text" id="includePattern" placeholder="Enter pattern to include...">
                <button onclick="addInclude()">Add / 添加</button>
            </div>
            <ul class="pattern-list" id="includeList"></ul>
        </div>
    </div>

    <div class="section">
        <div class="section-title">Exclude Filters / 排除过滤</div>
        <div class="form-group">
            <label>Add Exclude Pattern (添加排除规则):</label>
            <div style="display: flex; gap: 5px;">
                <input type="text" id="excludePattern" placeholder="Enter pattern to exclude...">
                <button onclick="addExclude()">Add / 添加</button>
            </div>
            <ul class="pattern-list" id="excludeList"></ul>
        </div>
    </div>

    <div class="section">
        <div class="section-title">Filter Options / 过滤选项</div>
        <div class="form-group">
            <label>
                <input type="checkbox" id="useRegex">
                Use Regular Expressions (使用正则表达式)
            </label>
        </div>
        <div class="form-group">
            <label>
                <input type="checkbox" id="caseSensitive">
                Case Sensitive (区分大小写)
            </label>
        </div>
        <div class="info-text">
            Regex: Match text using regular expressions<br>
            Case Sensitive: Match exact case
        </div>
    </div>

    <div class="section">
        <div class="section-title">Search Log History / 搜索历史日志</div>
        <div class="form-group">
            <div style="display: flex; gap: 5px;">
                <input type="text" id="searchPattern" placeholder="Search...">
                <button onclick="searchHistory()">Search / 搜索</button>
            </div>
        </div>
    </div>

    <div class="section">
        <div class="section-title">Actions / 操作</div>
        <div class="form-group">
            <button onclick="exportLogs()">Export Logs / 导出日志</button>
            <button class="danger" onclick="clearAll()">Clear All / 清空全部</button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const config = ${config};
        const levels = ${levels};

        function addInclude() {
            const input = document.getElementById('includePattern');
            if (input.value.trim()) {
                vscode.postMessage({
                    command: 'addInclude',
                    pattern: input.value.trim()
                });
                input.value = '';
            }
        }

        function addExclude() {
            const input = document.getElementById('excludePattern');
            if (input.value.trim()) {
                vscode.postMessage({
                    command: 'addExclude',
                    pattern: input.value.trim()
                });
                input.value = '';
            }
        }

        function searchHistory() {
            const input = document.getElementById('searchPattern');
            if (input.value.trim()) {
                vscode.postMessage({
                    command: 'search',
                    pattern: input.value.trim(),
                    limit: 100
                });
            }
        }

        function exportLogs() {
            vscode.postMessage({ command: 'export' });
        }

        function clearAll() {
            if (confirm('Clear all logs and filters? / 确定要清空所有日志和过滤规则吗?')) {
                vscode.postMessage({ command: 'clear' });
            }
        }

        // Initialize UI
        function init() {
            // Initialize level checkboxes
            const checkboxContainer = document.getElementById('levelCheckboxes');
            levels.forEach(level => {
                const div = document.createElement('div');
                div.className = 'checkbox-item';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = config.levels.includes(level);
                checkbox.onchange = function() {
                    vscode.postMessage({
                        command: 'toggleLevel',
                        level: level,
                        checked: this.checked
                    });
                };
                
                const label = document.createElement('label');
                label.textContent = level.toUpperCase();
                label.style.marginLeft = '5px';
                label.style.fontWeight = 'normal';
                
                div.appendChild(checkbox);
                div.appendChild(label);
                checkboxContainer.appendChild(div);
            });

            // Update pattern lists
            updatePatternLists();

            // Initialize options
            document.getElementById('useRegex').checked = config.useRegex;
            document.getElementById('caseSensitive').checked = config.caseSensitive;

            // Add event listeners for options
            document.getElementById('useRegex').onchange = function() {
                config.useRegex = this.checked;
                vscode.postMessage({
                    command: 'updateConfig',
                    config: config
                });
            };

            document.getElementById('caseSensitive').onchange = function() {
                config.caseSensitive = this.checked;
                vscode.postMessage({
                    command: 'updateConfig',
                    config: config
                });
            };
        }

        function updatePatternLists() {
            // Update include list
            const includeList = document.getElementById('includeList');
            includeList.innerHTML = '';
            config.include.forEach((pattern, index) => {
                const li = document.createElement('li');
                li.className = 'pattern-item';
                
                const span = document.createElement('span');
                span.textContent = pattern;
                
                const btn = document.createElement('button');
                btn.className = 'danger';
                btn.textContent = '×';
                btn.onclick = function() {
                    config.include.splice(index, 1);
                    vscode.postMessage({
                        command: 'removeInclude',
                        index: index
                    });
                };
                
                li.appendChild(span);
                li.appendChild(btn);
                includeList.appendChild(li);
            });

            // Update exclude list
            const excludeList = document.getElementById('excludeList');
            excludeList.innerHTML = '';
            config.exclude.forEach((pattern, index) => {
                const li = document.createElement('li');
                li.className = 'pattern-item';
                
                const span = document.createElement('span');
                span.textContent = pattern;
                
                const btn = document.createElement('button');
                btn.className = 'danger';
                btn.textContent = '×';
                btn.onclick = function() {
                    config.exclude.splice(index, 1);
                    vscode.postMessage({
                        command: 'removeExclude',
                        index: index
                    });
                };
                
                li.appendChild(span);
                li.appendChild(btn);
                excludeList.appendChild(li);
            });
        }

        init();
    </script>
</body>
</html>
        `;
    }

    private showSearchResults(results: LogEntry[]): void {
        const items = results.map(entry => ({
            label: `Line ${entry.line} [${entry.level.toUpperCase()}] ${entry.timestamp.toLocaleString()}`,
            description: entry.content.substring(0, 100)
        }));

        vscode.window.showQuickPick(items, {
            title: `Found ${results.length} results / 找到 ${results.length} 条结果`
        });
    }

    private async exportLogs(): Promise<void> {
        const logs = this.filterEngine.getLogHistory();
        const content = logs.map(entry => {
            return `[${entry.timestamp.toISOString()}] [${entry.level.toUpperCase()}] Line ${entry.line}: ${entry.content}`;
        }).join('\n');

        const uri = await vscode.window.showSaveDialog({
            title: 'Export Logs / 导出日志',
            defaultUri: vscode.Uri.file('serial_log.txt')
        });

        if (uri) {
            await vscode.workspace.fs.writeFile(
                uri,
                Buffer.from(content, 'utf-8')
            );
        }
    }
}
