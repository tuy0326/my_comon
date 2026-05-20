/*
 * Copyright (c) 2024-2026 My Developer and others
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 */
import * as vscode from 'vscode';

export interface LogEntry {
    id: string;
    timestamp: Date;
    content: string;
    level: LogLevel;
    line: number;
}

export enum LogLevel {
    DEBUG = 'debug',
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error'
}

export interface FilterConfig {
    // Include filters - show lines matching ANY pattern
    include: string[];
    
    // Exclude filters - hide lines matching ANY pattern
    exclude: string[];
    
    // Log levels to show
    levels: LogLevel[];
    
    // Whether to use regex
    useRegex: boolean;
    
    // Case sensitive
    caseSensitive: boolean;
}

export interface FilterRule {
    id: string;
    name: string;
    pattern: string;
    caseSensitive: boolean;
    useRegex: boolean;
}

export interface LogFilter {
    addRule(rule: FilterRule): void;
    removeRule(ruleId: string): void;
    applyFilters(config: FilterConfig): void;
    clearFilters(): void;
    shouldDisplay(logEntry: LogEntry, config: FilterConfig): boolean;
    searchHistory(pattern: string, limit?: number): LogEntry[];
}
