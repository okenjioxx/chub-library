// Use absolute path imports for third-party extension compatibility.
// Third-party extensions are loaded from /scripts/extensions/third-party/<name>/
// so relative paths like ../../ don't resolve correctly.
import { getContext } from '/scripts/extensions.js';

const EXTENSION_NAME = 'chub-library';
const GATEWAY_URL = 'https://gateway.chub.ai/search';
const TAGS_URL = 'https://gateway.chub.ai/tags';

/**
 * Fetch real tags from Chub.ai's tag API.
 * @param {string} query Search term
 * @returns {Promise<Array<{name: string, count: number}>>}
 */
async function fetchChubTags(query) {
    try {
        const res = await fetch(`${TAGS_URL}?first=10`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ search: query }),
        });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.tags ?? []).map(t => ({
            name: t.name,
            count: t.non_private_projects_count ?? 0,
        }));
    } catch {
        return [];
    }
}

/**
 * Resolves the base path for loading extension assets (HTML, etc).
 * Works for both built-in and third-party installs.
 */
function getExtensionPath() {
    // Try third-party path first, then built-in
    const paths = [
        `/scripts/extensions/third-party/${EXTENSION_NAME}`,
        `/scripts/extensions/${EXTENSION_NAME}`,
    ];
    return paths;
}

jQuery(async () => {
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

    $('#extensionsMenu').append(`
        <div id="chub-library-button" class="list-group-item list-group-item-action clickable" title="Chub Library">
            <i class="fa-solid fa-cloud-arrow-down"></i>
            <span class="extension-name">Chub Library</span>
        </div>
    `);

    // ── References ──
    const $drawer   = $('#chub-library-drawer');
    const $grid     = $('#chub-results-grid');
    const $spinner  = $('#chub-spinner');
    const $search   = $('#chub-search-input');
    const $submit   = $('#chub-search-submit');
    const $sort     = $('#chub-sort-dropdown');
    const $nsfw     = $('#chub-nsfw-checkbox');
    const $nsfl     = $('#chub-nsfl-checkbox');
    const $tagIn    = $('#chub-tags-input');
    const $tagBox   = $('#chub-tags-chips');
    const $tagAC    = $('#chub-tags-autocomplete');

    // ── Tag Chip State ──
    const lockedTags = [];
    let acIndex = -1;

    function renderChips() {
        $tagBox.find('.chub-chip').remove();
        lockedTags.forEach((tag, i) => {
            $tagIn.before(
                $(`<span class="chub-chip">${tag}<span class="chub-chip-x" data-idx="${i}">✕</span></span>`)
            );
        });
    }

    function addTag(raw) {
        const tag = String(raw).trim();
        if (!tag || lockedTags.includes(tag)) return;
        lockedTags.push(tag);
        renderChips();
        $tagIn.val('').focus();
        $tagAC.removeClass('open').empty();
        acIndex = -1;
        performSearch();
    }

    function removeTag(idx) {
        lockedTags.splice(idx, 1);
        renderChips();
        performSearch();
    }

    // Autocomplete — live search from Chub.ai tag API with debounce
    let acTimer = null;
    $tagIn.on('input', function () {
        const val = String($(this).val()).trim();
        if (!val) { $tagAC.removeClass('open').empty(); acIndex = -1; return; }

        clearTimeout(acTimer);
        acTimer = setTimeout(async () => {
            const hits = await fetchChubTags(val);
            const filtered = hits.filter(t => !lockedTags.includes(t.name));

            if (!filtered.length) { $tagAC.removeClass('open').empty(); acIndex = -1; return; }

            acIndex = -1;
            $tagAC.empty();
            filtered.forEach(t => {
                const countLabel = t.count >= 1000 ? `${(t.count / 1000).toFixed(1)}k` : String(t.count);
                $tagAC.append(`<div class="chub-ac-item" data-tag="${t.name}"><span>${t.name}</span><span class="chub-ac-count">${countLabel}</span></div>`);
            });
            $tagAC.addClass('open');
        }, 250);
    });

    // Keyboard nav
    $tagIn.on('keydown', function (e) {
        const items = $tagAC.find('.chub-ac-item');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            acIndex = Math.min(acIndex + 1, items.length - 1);
            items.removeClass('active').eq(acIndex).addClass('active');
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            acIndex = Math.max(acIndex - 1, 0);
            items.removeClass('active').eq(acIndex).addClass('active');
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const selected = acIndex >= 0 ? String(items.eq(acIndex).data('tag')) : String($(this).val()).trim();
            if (selected) addTag(selected);
        } else if (e.key === 'Backspace' && !$(this).val() && lockedTags.length) {
            removeTag(lockedTags.length - 1);
        }
    });

    // Click handlers
    $tagAC.on('click', '.chub-ac-item', e => addTag($(e.currentTarget).data('tag')));
    $tagBox.on('click', '.chub-chip-x', e => { e.stopPropagation(); removeTag(+$(e.currentTarget).data('idx')); });
    $tagBox.on('click', () => $tagIn.focus());
    $(document).on('click', e => { if (!$(e.target).closest('.chub-tags-chips-wrap').length) $tagAC.removeClass('open').empty(); });

    // ── Drawer ──
    $('#chub-library-button').on('click', () => {
        $drawer.addClass('open');
        if (!$grid.children().length) performSearch();
    });
    $('#chub-close-drawer').on('click', () => $drawer.removeClass('open'));

    // ── Search ──
    async function performSearch() {
        $grid.empty();
        $spinner.show();

        const params = new URLSearchParams({
            first: '48',
            page: '1',
            namespace: 'characters',
            search: String($search.val()).trim(),
            nsfw: String($nsfw.is(':checked')),
            nsfl: String($nsfl.is(':checked')),
            sort: String($sort.val()),
            include_forks: 'true',
            nsfw_only: 'false',
            require_custom_prompt: 'false',
            require_example_dialogues: 'false',
            require_images: 'false',
            require_expressions: 'false',
            asc: 'false',
            min_ai_rating: '0',
            min_tokens: '50',
            max_tokens: '100000',
            chub: 'true',
            require_lore: 'false',
            exclude_mine: 'true',
            require_lore_embedded: 'false',
            require_lore_linked: 'false',
            min_tags: '2',
            inclusive_or: 'false',
            recommended_verified: 'false',
            require_alternate_greetings: 'false',
            count: 'false',
        });

        if (lockedTags.length) params.set('topics', lockedTags.join(','));

        try {
            const res = await fetch(`${GATEWAY_URL}?${params}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}',
            });
            if (!res.ok) throw new Error(String(res.status));

            const nodes = (await res.json()).data?.nodes ?? [];
            renderCards(nodes);
        } catch (err) {
            console.error('Chub search error:', err);
            $grid.html('<div class="chub-empty-state">⚠️ Search failed — check your connection.</div>');
        } finally {
            $spinner.hide();
        }
    }

    $submit.on('click', performSearch);
    $search.on('keypress', e => { if (e.which === 13) performSearch(); });
    $sort.on('change', performSearch);
    $nsfw.on('change', performSearch);
    $nsfl.on('change', performSearch);

    // ── Render ──
    function renderCards(nodes) {
        if (!nodes.length) {
            $grid.html('<div class="chub-empty-state">No characters found.</div>');
            return;
        }

        nodes.forEach(node => {
            const img = node.max_res_url || node.avatar_url
                || `https://avatars.charhub.io/avatars/${node.fullPath}/chara_card_v2.png`;

            // Build tag pills — duplicate for seamless scroll loop
            let tagsHtml = '';
            const topics = node.topics;
            if (Array.isArray(topics) && topics.length) {
                const pills = topics.map(t => `<span class="chub-tag-pill">${t}</span>`).join('');
                const cls = topics.length > 3 ? ' scrollable' : '';
                const inner = topics.length > 3 ? pills + pills : pills;
                tagsHtml = `<div class="chub-card-tags"><div class="chub-card-tags-inner${cls}">${inner}</div></div>`;
            }

            const $card = $(`
                <div class="chub-card">
                    <img src="${img}" alt="${node.name}" loading="lazy">
                    <div class="chub-card-info">
                        <h4 class="chub-card-name">${node.name}</h4>
                        <div class="chub-card-stats">
                            <span><i class="fa-solid fa-star"></i> ${node.starCount ?? node.ratingCount ?? 0}</span>
                            <span><i class="fa-solid fa-download"></i> ${node.nChats ?? 0}</span>
                        </div>
                        ${tagsHtml}
                    </div>
                    <div class="chub-card-actions">
                        <button class="chub-action-btn chub-action-import" title="Import"><i class="fa-solid fa-download"></i></button>
                        <a href="https://chub.ai/characters/${node.fullPath}" target="_blank"
                           class="chub-action-btn chub-action-details" title="View on Chub"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
                    </div>
                </div>
            `);

            // Import — uses SillyTavern's native Chub downloader
            $card.find('.chub-action-import').on('click', async function (e) {
                e.stopPropagation();
                const $c = $(this).closest('.chub-card');
                $c.addClass('chub-downloading');
                try {
                    const ctx = getContext();
                    await ctx.importFromExternalUrl(`https://chub.ai/characters/${node.fullPath}`);
                    toastr.success(`${node.name} imported!`);
                    if (ctx.getCharacters) await ctx.getCharacters();
                } catch (err) {
                    console.error('Import error:', err);
                    toastr.error(`Failed: ${node.name}`);
                } finally {
                    $c.removeClass('chub-downloading');
                }
            });

            $grid.append($card);
        });
    }
});
