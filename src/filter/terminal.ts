/*
 * Copyright (c) 2024-2026 My Developer and others
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 */
import * as vscode from 'vscode';
import { SerialDevice } from '../serial-device';
import { FilterEngine } from '../filter/engine';

export class FilteredSerialTerminal implements vscode.Pseudoterminal {
    private writeEmitter = new vscode.EventEmitter<string>();
    public onDidWrite: vscode.Event<string> = this.writeEmitter.event;
    private closeEmitter = new vscode.EventEmitter<number>();
    public onDidClose: vscode.Event<number> = this.closeEmitter.event;
    public closed = false;
    
    private filterEngine: FilterEngine;
    private autoFilter: boolean;
    private showTimestamp: boolean;
    private timestampFormat: string;

    public constructor(
        protected serialDevice: SerialDevice, 
        protected options: SerialOptions,
        maxHistory: number = 10000
    ) {
        this.filterEngine = new FilterEngine(maxHistory);
        this.autoFilter = vscode.workspace.getConfiguration('my-comon').get('autoFilter', true);
        this.showTimestamp = vscode.workspace.getConfiguration('my-comon').get('showTimestamp', true);
        this.timestampFormat = vscode.workspace.getConfiguration('my-comon').get('timestampFormat', 'YYYY-MM-DD HH:mm:ss.SSS');
    }

    public async open(_initialDimensions: vscode.TerminalDimensions | undefined): Promise<void> {
        this.serialDevice.onData(data => this.processData(data));
        this.serialDevice.onEnd(() => {
            if (!this.closed) {
                this.closed = true;
                this.closeEmitter.fire(0);
            }
        });

        this.serialDevice.open(this.options);
        this.writeLine(`Opened with baud rate: ${this.options.baudRate}`);
    }

    public close(): void {
        this.serialDevice.close();
    }

    public handleInput(data: string): void {
        this.writeOutput(data);
        this.serialDevice.send(data);
    }

    private processData(data: string): void {
        // Add to filter engine and check if should display
        const entry = this.filterEngine.addEntry(data);
        
        if (this.autoFilter && !this.filterEngine.shouldDisplay(entry)) {
            return; // Filtered out
        }
        
        // Write with optional timestamp
        if (this.showTimestamp) {
            const timestamp = this.formatTimestamp(entry.timestamp);
            this.writeLine(timestamp + ' ' + entry.content);
        } else {
            this.writeLine(entry.content);
        }
    }

    private formatTimestamp(date: Date): string {
        // Simple timestamp formatting
        const pad = (num: number, size: number): string => {
            return num.toString().padStart(size, '0');
        };

        return `[${date.getFullYear()}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)} ${pad(date.getHours(), 2)}:${pad(date.getMinutes(), 2)}:${pad(date.getSeconds(), 2)}.${pad(date.getMilliseconds(), 3)}]`;
    }

    private writeLine(message: string): void {
        this.writeOutput(`${message}\n`);
    }

    private writeOutput(message: string): void {
        // VS Code terminal needs carriage returns
        const output = message.replace(/\r/g, '').replace(/\n/g, '\r\n');
        this.writeEmitter.fire(output);
    }

    public getFilterEngine(): FilterEngine {
        return this.filterEngine;
    }
}
