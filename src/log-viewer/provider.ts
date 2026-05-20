import * as vscode from 'vscode';
import { SerialDevice } from '../serial-device';
import { SerialInfo } from '../../api/serial-monitor';

export interface SerialPortItem {
    path: string;
    vendorId: number;
    productId: number;
    serialNumber: string;
    firmwareVersion: string;
    manufacturer: string;
}

export interface BaudRateItem {
    value: number;
    label: string;
}

export interface LineEndingItem {
    value: string;
    label: string;
}

export class SerialMonitorProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | null | undefined> = new vscode.EventEmitter();
    public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null | undefined> = this._onDidChangeTreeData.event;

    private rootItem: vscode.TreeItem;
    private logEntries: vscode.TreeItem[] = [];
    private maxEntries = 10000;
    private serialDevice: SerialDevice | undefined;
    private options: SerialOptions | undefined;
    private ports: SerialInfo[] = [];
    private selectedPort: string = '';
    private selectedBaudRate: number = 115200;
    private selectedLineEnding: string = '\n';
    private isMonitoring = false;

    constructor() {
        this.rootItem = new vscode.TreeItem('Serial Monitor / 串口监视器', vscode.TreeItemCollapsibleState.Expanded);
    }

    async getTreeElement(element: vscode.TreeItem): Promise<vscode.TreeItem> {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (!element) {
            return this.getLogItems();
        }
        return [];
    }

    private getLogItems(): vscode.TreeItem[] {
        if (this.logEntries.length === 0) {
            return [
                new vscode.TreeItem('Select port and baud rate, then click "Start Monitoring"', vscode.TreeItemCollapsibleState.None),
                new vscode.TreeItem('选择端口和波特率，然后点击"开始监视"', vscode.TreeItemCollapsibleState.None)
            ];
        }
        return [...this.logEntries];
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    parent(element: vscode.TreeItem): vscode.TreeItem | null {
        return null;
    }

    async loadPorts(): Promise<void> {
        try {
            const portList = await vscode.workspace.getConfiguration('serial-monitor').get<string[]>('ports', []);
            this.ports = portList.map((path: string, index: number) => ({
                path: path,
                vendorId: index.toString(),
                productId: index.toString(),
                serialNumber: '',
                manufacturer: `Port ${index + 1}`
            }));
        } catch (error) {
            this.ports = [];
        }
    }

    getPorts(): SerialInfo[] {
        return this.ports;
    }

    setPorts(ports: SerialInfo[]): void {
        this.ports = ports;
    }

    getPortItems(): vscode.QuickPickItem[] {
        if (this.ports.length === 0) {
            return [{ label: 'No ports found', description: '未找到端口' }];
        }
        return this.ports.map((p, index) => ({
            label: `COM${index + 1} - ${p.manufacturer || '通信端口'}`,
            description: p.path,
            detail: `${p.vendorId || 'N/A'}`
        }));
    }

    getBaudRateItems(): vscode.QuickPickItem[] {
        return [
            { label: '600', description: '600 bps' },
            { label: '1200', description: '1200 bps' },
            { label: '2400', description: '2400 bps' },
            { label: '4800', description: '4800 bps' },
            { label: '9600', description: '9600 bps' },
            { label: '19200', description: '19200 bps' },
            { label: '38400', description: '38400 bps' },
            { label: '57600', description: '57600 bps' },
            { label: '115200', description: '115200 bps' },
            { label: '230400', description: '230400 bps' },
            { label: '460800', description: '460800 bps' },
            { label: '921600', description: '921600 bps' }
        ];
    }

    getLineEndingItems(): vscode.QuickPickItem[] {
        return [
            { label: 'None', description: '无' },
            { label: 'CR', description: '\r' },
            { label: 'LF', description: '\n' },
            { label: 'CRLF', description: '\r\n' }
        ];
    }

    addLogEntry(content: string): void {
        const now = new Date();
        const timestamp = `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}]`;
        
        const entry = new vscode.TreeItem(`${timestamp} ${content}`);
        this.logEntries.push(entry);
        
        if (this.logEntries.length > this.maxEntries) {
            this.logEntries.shift();
        }
        
        this._onDidChangeTreeData.fire(null);
    }

    clear(): void {
        this.logEntries = [];
        this._onDidChangeTreeData.fire(null);
    }

    setSerialDevice(device: SerialDevice | undefined, options?: SerialOptions): void {
        this.serialDevice = device;
        this.options = options;
    }

    getSerialDevice(): SerialDevice | undefined {
        return this.serialDevice;
    }

    getOptions(): SerialOptions | undefined {
        return this.options;
    }

    setSelectedPort(port: string): void {
        this.selectedPort = port;
    }

    getSelectedPort(): string {
        return this.selectedPort;
    }

    setSelectedBaudRate(baudRate: number): void {
        this.selectedBaudRate = baudRate;
    }

    getSelectedBaudRate(): number {
        return this.selectedBaudRate;
    }

    setSelectedLineEnding(lineEnding: string): void {
        this.selectedLineEnding = lineEnding;
    }

    getSelectedLineEnding(): string {
        return this.selectedLineEnding;
    }

    setMonitoring(isMonitoring: boolean): void {
        this.isMonitoring = isMonitoring;
    }

    isMonitoringActive(): boolean {
        return this.isMonitoring;
    }

    startMonitoring(): void {
        this.isMonitoring = true;
    }

    stopMonitoring(): void {
        this.isMonitoring = false;
    }
}

export class LogTreeItem implements vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
    }
    
    public readonly children?: LogTreeItem[] | undefined;
    public readonly iconPath?: string | vscode.Uri | vscode.ThemeIcon | undefined;
    public readonly contextValue?: string | undefined;
}
