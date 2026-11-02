import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const vscodeMocks = vi.hoisted(() => ({
    iconTheme: 'test-theme' as string | undefined,
    extensions: [] as unknown[],
}));

vi.mock('vscode', () => ({
    workspace: {
        getConfiguration: () => ({ get: () => vscodeMocks.iconTheme }),
        onDidChangeConfiguration: () => ({ dispose: vi.fn() }),
    },
    extensions: {
        get all() {
            return vscodeMocks.extensions;
        },
    },
}));

import { FileIconThemeService } from '@/vscode/fileIconTheme';

describe('FileIconThemeService', () => {
    let extensionDir: string;

    beforeEach(() => {
        extensionDir = mkdtempSync(join(tmpdir(), 'codereview-icons-'));
        mkdirSync(join(extensionDir, 'icons'));
        for (const name of ['ts', 'file', 'folder', 'folder-src', 'json']) {
            writeFileSync(join(extensionDir, 'icons', `${name}.svg`), name);
        }
        writeFileSync(
            join(extensionDir, 'theme.json'),
            // jsonc: comments and trailing commas are allowed
            `{
                // test theme
                "iconDefinitions": {
                    "_ts": { "iconPath": "./icons/ts.svg" },
                    "_json": { "iconPath": "./icons/json.svg" },
                    "_file": { "iconPath": "./icons/file.svg" },
                    "_folder": { "iconPath": "./icons/folder.svg" },
                    "_src": { "iconPath": "./icons/folder-src.svg" },
                },
                "file": "_file",
                "folder": "_folder",
                "fileExtensions": { "ts": "_ts" },
                "fileNames": { "package.json": "_json" },
                "folderNames": { "src": "_src" }
            }`
        );
        vscodeMocks.iconTheme = 'test-theme';
        vscodeMocks.extensions = [
            {
                extensionPath: extensionDir,
                packageJSON: {
                    contributes: {
                        iconThemes: [
                            { id: 'test-theme', path: './theme.json' },
                        ],
                    },
                },
            },
        ];
    });

    afterEach(() => {
        rmSync(extensionDir, { recursive: true, force: true });
    });

    const dataUri = (content: string) =>
        `data:image/svg+xml;base64,${Buffer.from(content).toString('base64')}`;

    it('resolves file icons by name, extension, and default', async () => {
        const service = new FileIconThemeService();
        const { fileIcons } = await service.resolvePathIcons([
            'src/a/index.test.ts',
            'package.json',
            'README.unknown',
        ]);

        expect(fileIcons).toEqual({
            'src/a/index.test.ts': dataUri('ts'),
            'package.json': dataUri('json'),
            'README.unknown': dataUri('file'),
        });
    });

    it('resolves folder icons by lowercase folder name, falling back to the default folder icon', async () => {
        const service = new FileIconThemeService();
        const { folderIcons } = await service.resolvePathIcons([
            'SRC/Components/a.ts',
        ]);

        expect(folderIcons).toEqual({
            src: {
                collapsed: dataUri('folder-src'),
                expanded: dataUri('folder-src'),
            },
            components: {
                collapsed: dataUri('folder'),
                expanded: dataUri('folder'),
            },
        });
    });

    it('returns empty maps if the theme cannot be found', async () => {
        vscodeMocks.extensions = [];
        const service = new FileIconThemeService();

        expect(await service.resolvePathIcons(['a.ts'])).toEqual({
            fileIcons: {},
            folderIcons: {},
        });
    });
});
