/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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

import { inject, injectable, postConstruct } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { PreferenceProvider } from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { FolderPreferenceProvider, FolderPreferenceProviderFactory, FolderPreferenceProviderOptions } from './folder-preference-provider';
import { FileSystem } from '@theia/filesystem/lib/common';

@injectable()
export class FoldersPreferencesProvider extends PreferenceProvider {

    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(FileSystem) protected readonly fileSystem: FileSystem;
    @inject(FolderPreferenceProviderFactory) protected readonly folderPreferenceProviderFactory: FolderPreferenceProviderFactory;

    protected readonly providers = new Map<string, FolderPreferenceProvider>();

    @postConstruct()
    protected async init(): Promise<void> {
        await this.workspaceService.roots;

        this.updateProviders();
        this.workspaceService.onWorkspaceChanged(() => this.updateProviders());

        const readyPromises: Promise<void>[] = [];
        for (const provider of this.providers.values()) {
            readyPromises.push(provider.ready.catch(e => console.error(e)));
        }
        Promise.all(readyPromises).then(() => this._ready.resolve());
    }

    protected updateProviders(): void {
        const roots = this.workspaceService.tryGetRoots();
        const toDelete = new Set(this.providers.keys());
        for (const folder of roots) {
            // prefere theia over vscode
            for (const configPath of ['.theia', '.vscode']) {
                // prefer launch over settings
                for (const configFileName of ['launch.json', 'settings.json']) {
                    const configUri = new URI(folder.uri).resolve(configPath).resolve(configFileName);
                    const key = configUri.toString();
                    toDelete.delete(key);
                    if (!this.providers.has(key)) {
                        const provider = this.createProvider({ folder, configUri });
                        this.providers.set(key, provider);
                    }
                }
            }
        }
        for (const key of toDelete) {
            const provider = this.providers.get(key);
            if (provider) {
                this.providers.delete(key);
                provider.dispose();
            }
        }
    }

    getConfigUri(resourceUri?: string): URI | undefined {
        for (const provider of this.providers.values()) {
            const configUri = provider.getConfigUri(resourceUri);
            if (configUri && configUri.path.name === 'settings') {
                return configUri;
            }
        }
        return undefined;
    }

    getDomain(): string[] {
        return this.workspaceService.tryGetRoots().map(root => root.uri);
    }

    resolve<T>(preferenceName: string, resourceUri?: string): { value?: T, configUri?: URI } {
        for (const provider of this.getProviders(resourceUri)) {
            const { value, configUri } = provider.resolve(preferenceName, resourceUri);
            if (value !== undefined && value !== null) {
                return { value, configUri };
            }
        }
        return {};
    }

    getPreferences(resourceUri?: string): { [p: string]: any } {
        const result = {};
        for (const provider of this.getProviders(resourceUri).reverse()) {
            const preferences = provider.getPreferences();
            Object.assign(result, preferences);
        }
        return result;
    }

    async setPreference(preferenceName: string, value: any, resourceUri?: string): Promise<boolean> {
        for (const provider of this.getProviders(resourceUri)) {
            if (await provider.setPreference(preferenceName, value, resourceUri)) {
                return true;
            }
        }
        return false;
    }

    protected getProviders(resourceUri?: string): FolderPreferenceProvider[] {
        if (!resourceUri) {
            return [];
        }
        const resourcePath = new URI(resourceUri).path;
        let relativity = -1;
        // relativity -> folderUri/(.theia|.vscode) -> provider
        const providers = new Map<number, Map<string, FolderPreferenceProvider[]>>();
        for (const provider of this.providers.values()) {
            const configUri = provider.getConfigUri(resourceUri);
            if (configUri) {
                const folderRelativity = provider.folderUri.path.relativity(resourcePath);
                if (folderRelativity >= 0 && relativity <= folderRelativity) {
                    relativity = folderRelativity;

                    const configProviders = (providers.get(relativity) || new Map<string, FolderPreferenceProvider[]>());
                    const configPathUri = configUri.parent.toString();
                    const folderProviders = configProviders.get(configPathUri) || [];
                    folderProviders.push(provider);
                    configProviders.set(configPathUri, folderProviders);
                    providers.set(relativity, configProviders);
                }
            }
        }
        const resultMap = providers.get(relativity);
        return resultMap && resultMap.values().next().value || [];
    }

    protected createProvider(options: FolderPreferenceProviderOptions): FolderPreferenceProvider {
        const provider = this.folderPreferenceProviderFactory(options);
        this.toDispose.push(provider);
        this.toDispose.push(provider.onDidPreferencesChanged(change => this.onDidPreferencesChangedEmitter.fire(change)));
        return provider;
    }

}
