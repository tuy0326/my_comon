/*
 * Copyright (c) 2024-2026 My Developer and others
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 */
import { LogEntry, FilterConfig, FilterRule, LogFilter, LogLevel } from './types';

export class FilterEngine implements LogFilter {
    private logHistory: LogEntry[] = [];
    private currentConfig: FilterConfig | undefined;
    private lineCounter: number = 0;
    private maxHistory: number;

    constructor(maxHistory: number = 10000) {
        this.maxHistory = maxHistory;
    }

    public addEntry(content: string): LogEntry {
        this.lineCounter++;
        const entry: LogEntry = {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            content: content,
            level: this.detectLogLevel(content),
            line: this.lineCounter
        };

        this.logHistory.push(entry);
        
        if (this.logHistory.length > this.maxHistory) {
            this.logHistory.shift();
        }

        return entry;
    }

    public addRule(rule: FilterRule): void {
        // Store rules in config if needed
        if (!this.currentConfig) {
            this.currentConfig = {
                include: [],
                exclude: [],
                levels: Object.values(LogLevel),
                useRegex: false,
                caseSensitive: false
            };
        }
    }

    public removeRule(ruleId: string): void {
        // Remove from rules if stored
    }

    public applyFilters(config: FilterConfig): void {
        this.currentConfig = config;
    }

    public clearFilters(): void {
        this.currentConfig = undefined;
        this.lineCounter = 0;
        this.logHistory = [];
    }

    public shouldDisplay(logEntry: LogEntry, config?: FilterConfig): boolean {
        const activeConfig = config || this.currentConfig;
        
        if (!activeConfig) {
            return true;
        }

        // Check log level
        if (activeConfig.levels.length > 0 && !activeConfig.levels.includes(logEntry.level)) {
            return false;
        }

        // Check exclude patterns first
        if (activeConfig.exclude.length > 0 && this.matchesPattern(logEntry, activeConfig.exclude, activeConfig)) {
            return false;
        }

        // Check include patterns (must match at least one)
        if (activeConfig.include.length > 0 && !this.matchesPattern(logEntry, activeConfig.include, activeConfig)) {
            return false;
        }

        return true;
    }

    public searchHistory(pattern: string, limit: number = 100): LogEntry[] {
        const caseSensitive = this.currentConfig?.caseSensitive ?? false;
        const useRegex = this.currentConfig?.useRegex ?? false;

        return this.logHistory
            .reverse()
            .filter(entry => {
                return this.matchesFilter(entry, pattern, caseSensitive, useRegex);
            })
            .slice(0, limit);
    }

    public getLogHistory(): LogEntry[] {
        return [...this.logHistory];
    }

    private detectLogLevel(content: string): LogLevel {
        const lowerContent = content.toLowerCase();
        if (lowerContent.includes('[error]') || lowerContent.includes('error:') || lowerContent.includes('exception')) {
            return LogLevel.ERROR;
        }
        if (lowerContent.includes('[warn]') || lowerContent.includes('warning:')) {
            return LogLevel.WARN;
        }
        if (lowerContent.includes('[debug]') || lowerContent.includes('debug:')) {
            return LogLevel.DEBUG;
        }
        return LogLevel.INFO;
    }

    private matchesPattern(entry: LogEntry, patterns: string[], config: FilterConfig): boolean {
        return patterns.some(pattern => this.matchesFilter(entry, pattern, config.caseSensitive, config.useRegex));
    }

    private matchesFilter(entry: LogEntry, pattern: string, caseSensitive: boolean, useRegex: boolean): boolean {
        const content = entry.content;
        
        if (useRegex) {
            try {
                const flags = caseSensitive ? 'g' : 'gi';
                const regex = new RegExp(pattern, flags);
                return regex.test(content);
            } catch {
                return false;
            }
        }
        
        const searchContent = caseSensitive ? content : content.toLowerCase();
        const searchPattern = caseSensitive ? pattern : pattern.toLowerCase();
        return searchContent.includes(searchPattern);
    }
}
