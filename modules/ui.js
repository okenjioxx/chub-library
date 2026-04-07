// UI Module — handles drawer, controls, and card rendering with infinite scroll

import * as CoreAPI from './core-api.js';
import * as Search from './search.js';

// DOM references
let _$drawer = null;
let _$grid = null;
let _$spinner = null;
let _$searchInput = null;
let _$searchSubmit = null;
let _$sortDropdown = null;
let _$nsfwCheckbox = null;
let _$nsflCheckbox = null;
let _$tagInput = null;
let _$tagBox = null;
let _$tagAutocomplete = null;
let _$resultsArea = null;

// Tag state
let _lockedTags = [];
let _acIndex = -1;
let _acTimer = null;

// Loading state
let _isInitialLoad = true;

/**
 * Initialize UI module
 * @param {Object} refs - DOM element references
 */
export function init(refs) {
    _$drawer = refs.drawer;
    _$grid = refs.grid;
    _$spinner = refs.spinner;
    _$searchInput = refs.searchInput;
    _$searchSubmit = refs.searchSubmit;
    _$sortDropdown = refs.sortDropdown;
    _$nsfwCheckbox = refs.nsfwCheckbox;
    _$nsflCheckbox = refs.nsflCheckbox;
    _$tagInput = refs.tagInput;
    _$tagBox = refs.tagBox;
    _$tagAutocomplete = refs.tagAutocomplete;
    _$resultsArea = refs.resultsArea;

    _setupEventListeners();
    _setupInfiniteScroll();
}

/**
 * Setup event listeners
 */
function _setupEventListeners() {
    // Search
    if (_$searchSubmit) {
        _$searchSubmit.on('click', () => _doSearch({ reset: true }));
    }
    if (_$searchInput) {
        _$searchInput.on('keypress', e => {
            if (e.which === 13) _doSearch({ reset: true });
        });
    }

    // Sort
    if (_$sortDropdown) {
        _$sortDropdown.on('change', () => {
            Search.updateState({ sort: _$sortDropdown.val() });
            _doSearch({ reset: true });
        });
    }

    // NSFW/NSFL toggles
    if (_$nsfwCheckbox) {
        _$nsfwCheckbox.on('change', () => {
            Search.updateState({ nsfw: _$nsfwCheckbox.is(':checked') });
            _doSearch({ reset: true });
        });
    }
    if (_$nsflCheckbox) {
        _$nsflCheckbox.on('change', () => {
            Search.updateState({ nsfl: _$nsflCheckbox.is(':checked') });
            _doSearch({ reset: true });
        });
    }

    // Tag input
    if (_$tagInput) {
        _$tagInput.on('input', _onTagInput);
        _$tagInput.on('keydown', _onTagKeydown);
    }

    // Tag autocomplete clicks
    if (_$tagAutocomplete) {
        _$tagAutocomplete.on('click', '.chub-ac-item', e => {
            _addTag($(e.currentTarget).data('tag'));
        });
    }

    // Tag chip removal
    if (_$tagBox) {
        _$tagBox.on('click', '.chub-chip-x', e => {
            e.stopPropagation();
            _removeTag(+$(e.currentTarget).data('idx'));
        });
        _$tagBox.on('click', () => _$tagInput?.focus());
    }

    // Close autocomplete on outside click
    $(document).on('click', e => {
        if (!$(e.target).closest('.chub-tags-chips-wrap').length) {
            _$tagAutocomplete?.removeClass('open').empty();
        }
    });
}

/**
 * Setup infinite scroll
 */
function _setupInfiniteScroll() {
    if (_$resultsArea) {
        Search.setupInfiniteScroll(_$resultsArea, async () => {
            const state = Search.getState();
            if (state.hasMore && !state.isLoading) {
                _$spinner?.show();
                const result = await Search.loadMore();
                if (result.results.length > 0) {
                    renderCards(result.results, { append: true });
                }
                _$spinner?.hide();
            }
        });
    }
}

/**
 * Perform search with loading state
 * @param {Object} options
 */
async function _doSearch(options = {}) {
    if (_isInitialLoad) {
        _$spinner?.show();
    }

    try {
        const result = await Search.performSearch(options);

        if (result.error) {
            _$grid?.html('<div class="chub-empty-state">⚠️ Search failed — check your connection.</div>');
        } else if (result.results.length === 0) {
            _$grid?.html('<div class="chub-empty-state">No characters found.</div>');
        } else {
            renderCards(result.results, { append: options.append });
        }
    } catch (err) {
        CoreAPI.debugError('Search error:', err);
        _$grid?.html('<div class="chub-empty-state">⚠️ An unexpected error occurred.</div>');
    } finally {
        _$spinner?.hide();
        _isInitialLoad = false;
    }
}

/**
 * Render character cards
 * @param {Array} nodes
 * @param {Object} options
 * @param {boolean} options.append - Append to existing cards
 */
export function renderCards(nodes, options = {}) {
    if (!nodes?.length) return;

    const { append = false } = options;

    if (!append) {
        _$grid?.empty();
    }

    nodes.forEach(node => {
        const img = node.maxResUrl || node.avatarUrl || '';

        // Build tag pills
        let tagsHtml = '';
        const topics = node.topics;
        if (Array.isArray(topics) && topics.length) {
            const pills = topics.map(t => `<span class="chub-tag-pill">${CoreAPI.escapeHtml(t)}</span>`).join('');
            const cls = topics.length > 3 ? ' scrollable' : '';
            const inner = topics.length > 3 ? pills + pills : pills;
            tagsHtml = `<div class="chub-card-tags"><div class="chub-card-tags-inner${cls}">${inner}</div></div>`;
        }

        const $card = $(`
            <div class="chub-card">
                <img src="${CoreAPI.escapeHtml(img)}" alt="${CoreAPI.escapeHtml(node.name)}" loading="lazy">
                <div class="chub-card-info">
                    <h4 class="chub-card-name">${CoreAPI.escapeHtml(node.name)}</h4>
                    <div class="chub-card-stats">
                        <span><i class="fa-solid fa-star"></i> ${node.starCount ?? 0}</span>
                        <span><i class="fa-solid fa-download"></i> ${node.nChats ?? 0}</span>
                    </div>
                    ${tagsHtml}
                </div>
                <div class="chub-card-actions">
                    <button class="chub-action-btn chub-action-import" title="Import"><i class="fa-solid fa-download"></i></button>
                    <a href="https://chub.ai/characters/${CoreAPI.escapeHtml(node.fullPath)}" target="_blank"
                       class="chub-action-btn chub-action-details" title="View on Chub"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
                </div>
            </div>
        `);

        // Import handler
        $card.find('.chub-action-import').on('click', async function (e) {
            e.stopPropagation();
            const $c = $(this).closest('.chub-card');
            $c.addClass('chub-downloading');
            try {
                const success = await CoreAPI.importCharacter(`https://chub.ai/characters/${node.fullPath}`);
                if (success) {
                    CoreAPI.showToast(`${node.name} imported!`, 'success');
                    await CoreAPI.refreshCharacters();
                } else {
                    CoreAPI.showToast(`Failed: ${node.name}`, 'error');
                }
            } catch (err) {
                CoreAPI.debugError('Import error:', err);
                CoreAPI.showToast(`Failed: ${node.name}`, 'error');
            } finally {
                $c.removeClass('chub-downloading');
            }
        });

        _$grid?.append($card);
    });
}

/**
 * Tag input handler
 */
function _onTagInput() {
    const val = String(_$tagInput?.val() || '').trim();
    if (!val) {
        _$tagAutocomplete?.removeClass('open').empty();
        _acIndex = -1;
        return;
    }

    clearTimeout(_acTimer);
    _acTimer = setTimeout(async () => {
        const hits = await Search.fetchTagSuggestions(val);
        const filtered = hits.filter(t => !_lockedTags.includes(t.name));

        if (!filtered.length) {
            _$tagAutocomplete?.removeClass('open').empty();
            _acIndex = -1;
            return;
        }

        _acIndex = -1;
        _$tagAutocomplete?.empty();
        filtered.forEach(t => {
            const countLabel = t.count >= 1000 ? `${(t.count / 1000).toFixed(1)}k` : String(t.count);
            _$tagAutocomplete?.append(`<div class="chub-ac-item" data-tag="${CoreAPI.escapeHtml(t.name)}"><span>${CoreAPI.escapeHtml(t.name)}</span><span class="chub-ac-count">${countLabel}</span></div>`);
        });
        _$tagAutocomplete?.addClass('open');
    }, 250);
}

/**
 * Tag input keydown handler
 * @param {KeyboardEvent} e
 */
function _onTagKeydown(e) {
    const items = _$tagAutocomplete?.find('.chub-ac-item');
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        _acIndex = Math.min(_acIndex + 1, (items?.length || 1) - 1);
        items?.removeClass('active').eq(_acIndex).addClass('active');
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        _acIndex = Math.max(_acIndex - 1, 0);
        items?.removeClass('active').eq(_acIndex).addClass('active');
    } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = _acIndex >= 0 ? String(items?.eq(_acIndex).data('tag')) : String(_$tagInput?.val() || '').trim();
        if (selected) _addTag(selected);
    } else if (e.key === 'Backspace' && !_$tagInput?.val() && _lockedTags.length) {
        _removeTag(_lockedTags.length - 1);
    }
}

/**
 * Add a tag
 * @param {string} raw
 */
function _addTag(raw) {
    const tag = String(raw).trim();
    if (!tag || _lockedTags.includes(tag)) return;
    _lockedTags.push(tag);
    _renderChips();
    _$tagInput?.val('').focus();
    _$tagAutocomplete?.removeClass('open').empty();
    _acIndex = -1;
    Search.updateState({ tags: _lockedTags });
    _doSearch({ reset: true });
}

/**
 * Remove a tag
 * @param {number} idx
 */
function _removeTag(idx) {
    _lockedTags.splice(idx, 1);
    _renderChips();
    Search.updateState({ tags: _lockedTags });
    _doSearch({ reset: true });
}

/**
 * Render tag chips
 */
function _renderChips() {
    _$tagBox?.find('.chub-chip').remove();
    _lockedTags.forEach((tag, i) => {
        _$tagInput?.before(
            $(`<span class="chub-chip">${CoreAPI.escapeHtml(tag)}<span class="chub-chip-x" data-idx="${i}">✕</span></span>`)
        );
    });
}

/**
 * Open drawer
 */
export function openDrawer() {
    _$drawer?.addClass('open');
    const state = Search.getState();
    if (!state.results.length && !state.isLoading) {
        _doSearch();
    }
}

/**
 * Close drawer
 */
export function closeDrawer() {
    _$drawer?.removeClass('open');
}

/**
 * Cleanup UI module
 */
export function destroy() {
    Search.removeInfiniteScroll();
    _$drawer = null;
    _$grid = null;
    _$spinner = null;
    _$searchInput = null;
    _$searchSubmit = null;
    _$sortDropdown = null;
    _$nsfwCheckbox = null;
    _$nsflCheckbox = null;
    _$tagInput = null;
    _$tagBox = null;
    _$tagAutocomplete = null;
    _$resultsArea = null;
}

export default {
    init,
    renderCards,
    openDrawer,
    closeDrawer,
    destroy,
};
