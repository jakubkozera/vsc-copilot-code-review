// esbuild picks the UMD build otherwise, which breaks bundling (see utils/json.ts)

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parse as parseJsonc } from 'jsonc-parser/lib/esm/main.js';
import * as vscode from 'vscode';

export type ThemeIconPair = { collapsed?: string; expanded?: string };

export type PathIcons = {
    /** data URIs keyed by the original file path */
    fileIcons: Record<string, string>;
    /** icon pairs keyed by lowercase folder name */
    folderIcons: Record<string, ThemeIconPair>;
};

type IconDefinition = { iconPath?: string; baseDir: string };

type ParsedTheme = {
    definitions: Record<string, IconDefinition>;
    file?: string;
    folder?: string;
    folderExpanded?: string;
    fileNames: Record<string, string>;
    fileExtensions: Record<string, string>;
    folderNames: Record<string, string>;
    folderNamesExpanded: Record<string, string>;
};

const emptyTheme = (): ParsedTheme => ({
    definitions: {},
    fileNames: {},
    fileExtensions: {},
    folderNames: {},
    folderNamesExpanded: {},
});

/** Resolves icons of the active VS Code file icon theme, for use in webviews. */
export class FileIconThemeService implements vscode.Disposable {
    private themePromise?: Promise<ParsedTheme | null>;
    private readonly dataUriCache = new Map<
        string,
        Promise<string | undefined>
    >();
    private readonly configListener: vscode.Disposable;

    constructor() {
        this.configListener = vscode.workspace.onDidChangeConfiguration(
            (ev) => {
                if (ev.affectsConfiguration('workbench.iconTheme')) {
                    this.themePromise = undefined;
                }
            }
        );
    }

    public dispose() {
        this.configListener.dispose();
    }

    /** Never throws; returns empty maps if no theme (or no icons) could be resolved. */
    public async resolvePathIcons(paths: string[]): Promise<PathIcons> {
        try {
            const theme = await this.getTheme();
            if (!theme) {
                return { fileIcons: {}, folderIcons: {} };
            }

            const fileIcons: Record<string, string> = {};
            await Promise.all(
                paths.map(async (filePath) => {
                    const uri = await this.resolveFileIcon(theme, filePath);
                    if (uri) {
                        fileIcons[filePath] = uri;
                    }
                })
            );
            const folderNames = paths.flatMap((p) => p.split('/').slice(0, -1));
            return {
                fileIcons,
                folderIcons: await this.resolveFolderIcons(theme, folderNames),
            };
        } catch (error) {
            console.error('Failed to resolve file icon theme:', error);
            return { fileIcons: {}, folderIcons: {} };
        }
    }

    private getTheme() {
        this.themePromise ??= this.loadConfiguredTheme();
        return this.themePromise;
    }

    private async loadConfiguredTheme(): Promise<ParsedTheme | null> {
        const themeId = vscode.workspace
            .getConfiguration('workbench')
            .get<string>('iconTheme');
        if (!themeId) {
            return null;
        }

        for (const extension of vscode.extensions.all) {
            const contributions = extension.packageJSON?.contributes
                ?.iconThemes as Array<{ id: string; path: string }> | undefined;
            const contribution = contributions?.find(
                (item) => item.id === themeId
            );
            if (!contribution) {
                continue;
            }
            try {
                return await this.loadTheme(
                    path.resolve(extension.extensionPath, contribution.path),
                    new Set()
                );
            } catch {
                return null;
            }
        }
        return null;
    }

    private async loadTheme(
        filePath: string,
        visited: Set<string>
    ): Promise<ParsedTheme> {
        const normalized = path.resolve(filePath);
        if (visited.has(normalized)) {
            return emptyTheme();
        }
        visited.add(normalized);

        const raw = parseJsonc(await fs.readFile(normalized, 'utf8')) as Record<
            string,
            unknown
        >;
        const baseDir = path.dirname(normalized);
        const parent =
            typeof raw.extends === 'string'
                ? await this.loadTheme(
                      path.resolve(baseDir, raw.extends),
                      visited
                  )
                : emptyTheme();

        const definitions: Record<string, IconDefinition> = {};
        if (raw.iconDefinitions && typeof raw.iconDefinitions === 'object') {
            for (const [id, value] of Object.entries(
                raw.iconDefinitions as Record<string, unknown>
            )) {
                const iconPath = (value as { iconPath?: unknown })?.iconPath;
                definitions[id] = {
                    iconPath:
                        typeof iconPath === 'string' ? iconPath : undefined,
                    baseDir,
                };
            }
        }

        return {
            definitions: { ...parent.definitions, ...definitions },
            file: stringValue(raw.file) || parent.file,
            folder: stringValue(raw.folder) || parent.folder,
            folderExpanded:
                stringValue(raw.folderExpanded) || parent.folderExpanded,
            fileNames: { ...parent.fileNames, ...stringMap(raw.fileNames) },
            fileExtensions: {
                ...parent.fileExtensions,
                ...stringMap(raw.fileExtensions),
            },
            folderNames: {
                ...parent.folderNames,
                ...stringMap(raw.folderNames),
            },
            folderNamesExpanded: {
                ...parent.folderNamesExpanded,
                ...stringMap(raw.folderNamesExpanded),
            },
        };
    }

    private resolveFileIcon(theme: ParsedTheme, filePath: string) {
        const name = path.basename(filePath).toLowerCase();
        let iconId = theme.fileNames[name];
        if (!iconId) {
            // longest extension first: "a.test.ts" tries "test.ts", then "ts"
            for (const match of name.matchAll(/\./g)) {
                iconId = theme.fileExtensions[name.slice(match.index + 1)];
                if (iconId) {
                    break;
                }
            }
        }
        return this.definitionUri(
            theme.definitions[iconId || theme.file || '']
        );
    }

    private async resolveFolderIcons(theme: ParsedTheme, names: string[]) {
        const result: Record<string, ThemeIconPair> = {};
        for (const name of new Set(names)) {
            const key = name.toLowerCase();
            const collapsedId = theme.folderNames[key] || theme.folder;
            const expandedId =
                theme.folderNamesExpanded[key] ||
                theme.folderExpanded ||
                collapsedId;
            result[key] = {
                collapsed: await this.definitionUri(
                    theme.definitions[collapsedId || '']
                ),
                expanded: await this.definitionUri(
                    theme.definitions[expandedId || '']
                ),
            };
        }
        return result;
    }

    private definitionUri(definition?: IconDefinition) {
        if (!definition?.iconPath) {
            return Promise.resolve(undefined);
        }

        const filePath = path.resolve(definition.baseDir, definition.iconPath);
        let cached = this.dataUriCache.get(filePath);
        if (!cached) {
            cached = fs
                .readFile(filePath)
                .then((content) => {
                    const extension = path
                        .extname(filePath)
                        .slice(1)
                        .toLowerCase();
                    const mime =
                        extension === 'svg'
                            ? 'image/svg+xml'
                            : `image/${extension}`;
                    return `data:${mime};base64,${content.toString('base64')}`;
                })
                .catch(() => undefined);
            this.dataUriCache.set(filePath, cached);
        }
        return cached;
    }
}

function stringValue(value: unknown) {
    return typeof value === 'string' ? value : undefined;
}

function stringMap(value: unknown): Record<string, string> {
    if (!value || typeof value !== 'object') {
        return {};
    }
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .filter(
                (entry): entry is [string, string] =>
                    typeof entry[1] === 'string'
            )
            .map(([key, item]) => [key.toLowerCase(), item])
    );
}
