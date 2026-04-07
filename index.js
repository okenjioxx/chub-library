// Chub Library Extension — Main Entry Point
// Modular architecture with provider registry

import * as CoreAPI from './modules/core-api.js';
import * as ProviderRegistry from './modules/provider-registry.js';
import * as Search from './modules/search.js';
import * as UI from './modules/ui.js';
import { ChubProvider } from './providers/chub-provider.js';

const EXTENSION_NAME = 'chub-library';

/**
 * Resolves the base path for loading extension assets (HTML, etc).
 * Works for both built-in and third-party installs.
 */
function getExtensionPath() {
    return [
        `/scripts/extensions/third-party/${EXTENSION_NAME}`,
        `/scripts/extensions/${EXTENSION_NAME}`,
    ];
}

jQuery(async () => {
    // ── Initialize Core API ──
    const ctx = CoreAPI.getContext();
    if (!ctx) {
        console.error('Chub Library: Could not get SillyTavern context');
        return;
    }
    CoreAPI.setContext(ctx);
    CoreAPI.loadSettings();

    // ── Register Providers ──
    const chubProvider = new ChubProvider();
    ProviderRegistry.registerProvider(chubProvider);

    // Initialize providers
    await ProviderRegistry.initProviders(CoreAPI);

    // Set Chub as active provider
    ProviderRegistry.setActiveProvider('chub');

    // ── Inject UI ──
    let html = null;
    for (const basePath of getExtensionPath()) {
        try {
            html = await $.get(`${basePath}/index.html`);
            if (html) break;
        } catch { /* try next */ }
    }

    if (!html) {
        console.error('Chub Library: Could not load index.html');
        return;
    }

    $('body').append(html);

    // Add button to extensions menu
    $('#extensionsMenu').append(`
        <div id="chub-library-button" class="list-group-item list-group-item-action clickable" title="Chub Library">
            <i class="fa-solid fa-cloud-arrow-down"></i>
            <span class="extension-name">Chub Library</span>
        </div>
    `);

    // ── Initialize UI Module ──
    UI.init({
        drawer: $('#chub-library-drawer'),
        grid: $('#chub-results-grid'),
        spinner: $('#chub-spinner'),
        searchInput: $('#chub-search-input'),
        searchSubmit: $('#chub-search-submit'),
        sortDropdown: $('#chub-sort-dropdown'),
        nsfwCheckbox: $('#chub-nsfw-checkbox'),
        nsflCheckbox: $('#chub-nsfl-checkbox'),
        tagInput: $('#chub-tags-input'),
        tagBox: $('#chub-tags-chips'),
        tagAutocomplete: $('#chub-tags-autocomplete'),
        resultsArea: $('#chub-results-area'),
    });

    // ── Button Handlers ──
    $('#chub-library-button').on('click', () => {
        UI.openDrawer();
    });

    $('#chub-close-drawer').on('click', () => {
        UI.closeDrawer();
    });

    // ── Apply Settings ──
    const settings = CoreAPI.getDefaultSettings();
    $('#chub-nsfw-checkbox').prop('checked', settings.nsfw);
    $('#chub-nsfl-checkbox').prop('checked', settings.nsfl);
    $('#chub-sort-dropdown').val(settings.sort);

    console.log('Chub Library: Loaded successfully with modular architecture.');
});
