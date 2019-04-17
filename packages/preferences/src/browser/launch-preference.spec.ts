/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

// tslint:disable:no-any
// tslint:disable:no-unused-expression

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import * as path from 'path';
import * as fs from 'fs-extra';
import * as assert from 'assert';
import { Container } from 'inversify';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { DisposableCollection, Disposable } from '@theia/core/lib/common/disposable';
import { PreferenceService, PreferenceServiceImpl } from '@theia/core/lib/browser/preferences/preference-service';
import { bindPreferenceService, bindMessageService, bindResourceProvider } from '@theia/core/lib/browser/frontend-application-module';
import { bindFileSystem, bindFileSystemWatcherServer } from '@theia/filesystem/lib/node/filesystem-backend-module';
import { bindFileResource } from '@theia/filesystem/lib/browser/filesystem-frontend-module';
import { PreferenceSchemaProvider } from '@theia/core/lib/browser/preferences/preference-contribution';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { FileSystemWatcher } from '@theia/filesystem/lib/browser/filesystem-watcher';
import { bindFileSystemPreferences } from '@theia/filesystem/lib/browser/filesystem-preferences';
import { FileShouldOverwrite } from '@theia/filesystem/lib/common/filesystem';
import { bindLogger } from '@theia/core/lib/node/logger-backend-module';
import { bindWorkspacePreferences } from '@theia/workspace/lib/browser';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { MockWindowService } from '@theia/core/lib/browser/window/test/mock-window-service';
import { MockWorkspaceServer } from '@theia/workspace/lib/common/test/mock-workspace-server';
import { WorkspaceServer } from '@theia/workspace/lib/common/workspace-protocol';
import { bindUserStorage } from '@theia/userstorage/lib/browser/user-storage-frontend-module';
import { bindPreferenceProviders } from './preference-bindings';

disableJSDOM();

process.on('unhandledRejection', (reason, promise) => {
    console.error(reason);
    throw reason;
});

/**
 * Expectations should be tested and aligned against VS Code.
 * See https://github.com/akosyakov/vscode-launch/blob/master/src/test/extension.test.ts
 */
describe('Launch Preferences', () => {

    const defaultConfiguration = {
        'configurations': [],
        'compounds': []
    };

    const validConfiguration = {
        'name': 'Launch Program',
        'program': '${file}',
        'request': 'launch',
        'type': 'node',
    };

    const validConfiguration2 = {
        'name': 'Launch Program 2',
        'program': '${file}',
        'request': 'launch',
        'type': 'node',
    };

    const bogusConfiguration = {};

    const validCompound = {
        'name': 'Compound',
        'configurations': [
            'Launch Program',
            'Launch Program 2'
        ]
    };

    const bogusCompound = {};

    const bogusCompound2 = {
        'name': 'Compound 2',
        'configurations': [
            'Foo',
            'Launch Program 2'
        ]
    };

    testSuite({
        name: 'No Preferences',
        expectation: defaultConfiguration
    });

    testLaunchAndSettingsSuite({
        name: 'Empty With Version',
        launch: {
            'version': '0.2.0'
        },
        expectation: {
            'version': '0.2.0',
            'configurations': [],
            'compounds': []
        }
    });

    testLaunchAndSettingsSuite({
        name: 'Empty With Version And Configurations',
        launch: {
            'version': '0.2.0',
            'configurations': [],
        },
        expectation: {
            'version': '0.2.0',
            'configurations': [],
            'compounds': []
        }
    });

    testLaunchAndSettingsSuite({
        name: 'Empty With Version And Compounds',
        launch: {
            'version': '0.2.0',
            'compounds': []
        },
        expectation: {
            'version': '0.2.0',
            'configurations': [],
            'compounds': []
        }
    });

    testLaunchAndSettingsSuite({
        name: 'Valid Conf',
        launch: {
            'version': '0.2.0',
            'configurations': [validConfiguration]
        },
        expectation: {
            'version': '0.2.0',
            'configurations': [validConfiguration],
            'compounds': []
        }
    });

    testLaunchAndSettingsSuite({
        name: 'Bogus Conf',
        launch: {
            'version': '0.2.0',
            'configurations': [validConfiguration, bogusConfiguration]
        },
        expectation: {
            'version': '0.2.0',
            'configurations': [validConfiguration, bogusConfiguration],
            'compounds': []
        }
    });

    testLaunchAndSettingsSuite({
        name: 'Completely Bogus Conf',
        launch: {
            'version': '0.2.0',
            'configurations': { 'valid': validConfiguration, 'bogus': bogusConfiguration }
        },
        expectation: {
            'version': '0.2.0',
            'configurations': { 'valid': validConfiguration, 'bogus': bogusConfiguration },
            'compounds': []
        }
    });

    testLaunchAndSettingsSuite({
        name: 'Valid Compound',
        launch: {
            'version': '0.2.0',
            'configurations': [validConfiguration, validConfiguration2],
            'compounds': [validCompound]
        },
        expectation: {
            'version': '0.2.0',
            'configurations': [validConfiguration, validConfiguration2],
            'compounds': [validCompound]
        }
    });

    testLaunchAndSettingsSuite({
        name: 'Valid And Bogus',
        launch: {
            'version': '0.2.0',
            'configurations': [validConfiguration, validConfiguration2, bogusConfiguration],
            'compounds': [validCompound, bogusCompound, bogusCompound2]
        },
        expectation: {
            'version': '0.2.0',
            'configurations': [validConfiguration, validConfiguration2, bogusConfiguration],
            'compounds': [validCompound, bogusCompound, bogusCompound2]
        }
    });

    testSuite({
        name: 'Mixed',
        launch: {
            'version': '0.2.0',
            'configurations': [validConfiguration, bogusConfiguration],
            'compounds': [bogusCompound, bogusCompound2]
        },
        settings: {
            launch: {
                'version': '0.2.0',
                'configurations': [validConfiguration2],
                'compounds': [validCompound]
            }
        },
        expectation: {
            'version': '0.2.0',
            'configurations': [validConfiguration, bogusConfiguration],
            'compounds': [bogusCompound, bogusCompound2]
        }
    });

    function testLaunchAndSettingsSuite({
        name, expectation, launch
    }: {
            name: string,
            expectation: any,
            launch?: any
        }): void {
        testSuite({
            name: name + ' Launch Configuration',
            launch,
            expectation
        });
        testSuite({
            name: name + ' Settings Configuration',
            settings: {
                'launch': launch
            },
            expectation
        });
    }

    function testSuite(options: {
        name: string,
        expectation: any,
        launch?: any,
        settings?: any
    }): void {

        describe(options.name, () => {

            testConfigSuite({
                ...options,
                configMode: '.vscode'
            });

            testConfigSuite({
                ...options,
                configMode: '.theia'
            });

            testConfigSuite({
                ...options,
                configMode: ['.theia', '.vscode']
            });

        });

    }

    function testConfigSuite({
        configMode, expectation, settings, launch
    }: {
            configMode: '.vscode' | '.theia' | ['.theia', '.vscode']
            expectation: any,
            launch?: any,
            settings?: any
        }): void {

        describe(JSON.stringify(configMode, undefined, 2), () => {
            const rootPath = path.resolve(__dirname, '..', '..', 'launch-preference-test-temp');
            const rootUri = FileUri.create(rootPath).toString();

            let preferences: PreferenceService;

            const toTearDown = new DisposableCollection();
            before(async () => {
                toTearDown.push(Disposable.create(enableJSDOM()));
                FrontendApplicationConfigProvider.set({
                    'applicationName': 'test',
                });

                fs.removeSync(rootPath);
                fs.ensureDirSync(rootPath);
                toTearDown.push(Disposable.create(() => fs.removeSync(rootPath)));

                const configPaths = Array.isArray(configMode) ? configMode : [configMode];
                if (settings) {
                    for (const configPath of configPaths) {
                        const settingsPath = path.resolve(rootPath, configPath, 'settings.json');
                        fs.ensureFileSync(settingsPath);
                        fs.writeFileSync(settingsPath, JSON.stringify(settings), 'utf-8');
                    }
                }
                if (launch) {
                    for (const configPath of configPaths) {
                        const launchPath = path.resolve(rootPath, configPath, 'launch.json');
                        fs.ensureFileSync(launchPath);
                        fs.writeFileSync(launchPath, JSON.stringify(launch), 'utf-8');
                    }
                }

                const container = new Container();
                const bind = container.bind.bind(container);
                const unbind = container.unbind.bind(container);
                bindLogger(bind);
                bindMessageService(bind);
                bindResourceProvider(bind);
                bindFileResource(bind);
                bindUserStorage(bind);
                bindPreferenceService(bind);
                bindFileSystem(bind);
                bindFileSystemWatcherServer(bind, { singleThreaded: true });
                bindFileSystemPreferences(bind);
                container.bind(FileShouldOverwrite).toConstantValue(async () => true);
                bind(FileSystemWatcher).toSelf().inSingletonScope();
                bindPreferenceProviders(bind, unbind);
                bindWorkspacePreferences(bind);
                container.bind(WorkspaceService).toSelf().inSingletonScope();
                container.bind(WindowService).toConstantValue(new MockWindowService());

                const workspaceServer = new MockWorkspaceServer();
                workspaceServer['getMostRecentlyUsedWorkspace'] = async () => rootUri;
                container.bind(WorkspaceServer).toConstantValue(workspaceServer);

                const schema = container.get(PreferenceSchemaProvider);
                schema.setSchema({
                    type: 'object',
                    scope: 'resource',
                    properties: {
                        'launch': {
                            type: 'object',
                            description: "Global debug launch configuration. Should be used as an alternative to 'launch.json' that is shared across workspaces",
                            default: { configurations: [], compounds: [] },
                            $ref: 'vscode://schemas/launch'
                        }
                    }
                });

                const impl = container.get(PreferenceServiceImpl);
                impl.initialize();
                toTearDown.push(impl);

                preferences = impl;
                toTearDown.push(Disposable.create(() => preferences = undefined!));

                await preferences.ready;
                await container.get(WorkspaceService).roots;
            });

            after(() => toTearDown.dispose());

            it('get from default', () => {
                const config = preferences.get('launch');
                assert.deepStrictEqual(expectation, JSON.parse(JSON.stringify(config)));
            });

            it('get from undefind', () => {
                const config = preferences.get('launch', undefined, undefined);
                assert.deepStrictEqual(expectation, JSON.parse(JSON.stringify(config)));
            });

            it('get from rootUri', () => {
                const config = preferences.get('launch', undefined, rootUri);
                assert.deepStrictEqual(expectation, JSON.parse(JSON.stringify(config)));
            });

            it('inspect in undefined', () => {
                const inspect = preferences.inspect('launch');
                const inspectExpectation = {
                    preferenceName: 'launch',
                    defaultValue: defaultConfiguration
                };
                const workspaceValue = launch || settings && settings.launch;
                if (workspaceValue !== undefined) {
                    Object.assign(inspectExpectation, { workspaceValue });
                }
                assert.deepStrictEqual(inspectExpectation, JSON.parse(JSON.stringify(inspect)));
            });

            it('inspect in rootUri', () => {
                const inspect = preferences.inspect('launch', rootUri);
                const inspectExpectation = {
                    preferenceName: 'launch',
                    defaultValue: defaultConfiguration
                };
                const value = launch || settings && settings.launch;
                if (value !== undefined) {
                    Object.assign(inspectExpectation, {
                        workspaceValue: value,
                        workspaceFolderValue: value
                    });
                }
                assert.deepStrictEqual(inspectExpectation, JSON.parse(JSON.stringify(inspect)));
            });

        });

    }

});
