import * as vscode from 'vscode';

export class PlaceholderProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | null | undefined> = new vscode.EventEmitter();
    public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null | undefined> = this._onDidChangeTreeData.event;

    async getTreeElement(element: vscode.TreeItem): Promise<vscode.TreeItem> {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (!element) {
            return [
                new vscode.TreeItem('Select port and baud rate, then click "Start Monitoring"', vscode.TreeItemCollapsibleState.None),
                new vscode.TreeItem('选择端口和波特率，然后点击"开始监视"', vscode.TreeItemCollapsibleState.None)
            ];
        }
        return [];
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    parent(element: vscode.TreeItem): vscode.TreeItem | null {
        return null;
    }
}
