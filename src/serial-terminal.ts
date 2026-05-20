import * as vscode from 'vscode';
import { SerialDevice } from './serial-device';

export class SerialTerminal implements vscode.Pseudoterminal {
    private writeEmitter = new vscode.EventEmitter<string>();
    public onDidWrite: vscode.Event<string> = this.writeEmitter.event;
    private closeEmitter = new vscode.EventEmitter<number>();
    public onDidClose: vscode.Event<number> = this.closeEmitter.event;
    public closed = false;

    public constructor(protected serialDevice: SerialDevice, protected options: SerialOptions) {
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

    protected processData(data: string): void {
        if (this.shouldShowTimestamp()) {
            const timestamp = this.getTimestamp();
            this.writeLine(timestamp + ' ' + data);
        } else {
            this.writeLine(data);
        }
    }

    private shouldShowTimestamp(): boolean {
        return vscode.workspace.getConfiguration('serial-monitor').get('showTimestamp', true);
    }

    private getTimestamp(): string {
        const now = new Date();
        const pad = (num: number, size: number): string => {
            return num.toString().padStart(size, '0');
        };
        return `[${now.getFullYear()}-${pad(now.getMonth() + 1, 2)}-${pad(now.getDate(), 2)} ${pad(now.getHours(), 2)}:${pad(now.getMinutes(), 2)}:${pad(now.getSeconds(), 2)}.${pad(now.getMilliseconds(), 3)}]`;
    }

    protected writeLine(message: string): void {
        this.writeOutput(`${message}\n`);
    }

    protected writeOutput(message: string): void {
        const output = message.replace(/\r/g, '').replace(/\n/g, '\r\n');
        this.writeEmitter.fire(output);
    }
}
