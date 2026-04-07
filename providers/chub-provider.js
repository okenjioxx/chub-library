// Chub Provider — integration with Chub.ai API

import { ProviderBase } from '../providers/provider-base.js';

const GATEWAY_URL = 'https://gateway.chub.ai/search';
const TAGS_URL = 'https://gateway.chub.ai/tags';

export class ChubProvider extends ProviderBase {
    get id() { return 'chub'; }
    get name() { return 'ChubAI'; }
    get icon() { return 'fa-solid fa-cloud'; }

    // ── Lifecycle ───────────────────────────────────────────

    async init(coreAPI) {
        await super.init(coreAPI);
        this._token = coreAPI?.getSetting?.('chubToken') || null;
    }

    // ── Character Linking ───────────────────────────────────

    getLinkInfo(char) {
        const ext = char?.data?.extensions;
        if (!ext) return null;

        // Check for Chub-specific extension data
        const chubData = ext.chub || ext.source?.chub;
        if (chubData?.fullPath || chubData?.id) {
            return {
                providerId: this.id,
                id: chubData.id || chubData.fullPath,
                fullPath: chubData.fullPath,
                linkedAt: chubData.linkedAt || null,
            };
        }

        // Check for URL pattern in extensions
        if (ext.source?.url?.includes('chub.ai')) {
            const url = ext.source.url;
            const match = url.match(/chub\.ai\/characters\/(.+)/);
            if (match) {
                return {
                    providerId: this.id,
                    id: match[1],
                    fullPath: match[1],
                };
            }
        }

        return null;
    }

    setLinkInfo(char, linkInfo) {
        if (!char?.data?.extensions) return;

        if (!char.data.extensions.chub) {
            char.data.extensions.chub = {};
        }

        if (linkInfo) {
            char.data.extensions.chub.fullPath = linkInfo.fullPath;
            char.data.extensions.chub.id = linkInfo.id;
            char.data.extensions.chub.linkedAt = new Date().toISOString();
        } else {
            delete char.data.extensions.chub;
        }
    }

    getCharacterUrl(linkInfo) {
        if (!linkInfo?.fullPath) return null;
        return `https://chub.ai/characters/${linkInfo.fullPath}`;
    }

    // ── Search & Browse ─────────────────────────────────────

    async search(params = {}) {
        const {
            query = '',
            page = 1,
            first = 48,
            sort = 'default',
            nsfw = false,
            nsfl = false,
            topics = [],
            hideOwned = false,
        } = params;

        const searchParams = new URLSearchParams({
            first: String(first),
            page: String(page),
            namespace: 'characters',
            search: query,
            nsfw: String(nsfw),
            nsfl: String(nsfl),
            sort,
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
            exclude_mine: String(hide_owned),
            require_lore_embedded: 'false',
            require_lore_linked: 'false',
            min_tags: '2',
            inclusive_or: 'false',
            recommended_verified: 'false',
            count: 'false',
            require_alternate_greetings: 'false',
        });

        if (topics.length > 0) {
            searchParams.set('topics', topics.join(','));
        }

        // Add auth headers if token is set
        const headers = { 'Content-Type': 'application/json' };
        if (this._token) {
            headers['Authorization'] = `Bearer ${this._token}`;
        }

        try {
            const res = await fetch(`${GATEWAY_URL}?${searchParams}`, {
                method: 'POST',
                headers,
                body: '{}',
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const data = await res.json();
            const nodes = data?.data?.nodes ?? [];

            const results = nodes.map(node => this._normalizeNode(node));

            return {
                results,
                hasMore: nodes.length >= first,
            };
        } catch (err) {
            this._coreAPI?.debugError?.('Chub search error:', err);
            return { results: [], hasMore: false, error: err.message };
        }
    }

    async fetchTags(query) {
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

    // ── Import ──────────────────────────────────────────────

    get supportsImport() { return true; }

    canHandleUrl(url) {
        return typeof url === 'string' && url.includes('chub.ai');
    }

    parseUrl(url) {
        const match = url.match(/chub\.ai\/characters\/(.+)/);
        return match ? match[1] : null;
    }

    async importCharacter(identifier) {
        const url = `https://chub.ai/characters/${identifier}`;
        const api = this._coreAPI;

        if (!api?.importCharacter) {
            return { success: false, error: 'Import function not available' };
        }

        try {
            const success = await api.importCharacter(url);
            if (success) {
                return { success: true, characterName: identifier.split('/').pop() };
            }
            return { success: false, error: 'Import failed' };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    // ── Update Checking ─────────────────────────────────────

    get supportsUpdates() { return true; }

    async checkForUpdate(char, linkInfo) {
        try {
            const remoteCard = await this.fetchRemoteCard(linkInfo);
            if (!remoteCard) return { hasUpdate: false, remoteCard: null };

            // Simple comparison - check if data differs
            const localData = char?.data || {};
            const hasChanges = (
                localData.description !== remoteCard.description ||
                localData.personality !== remoteCard.personality ||
                localData.scenario !== remoteCard.scenario ||
                localData.first_mes !== remoteCard.first_mes ||
                JSON.stringify(localData.tags) !== JSON.stringify(remoteCard.tags)
            );

            return { hasUpdate: hasChanges, remoteCard };
        } catch {
            return { hasUpdate: false, remoteCard: null };
        }
    }

    async fetchRemoteCard(linkInfo) {
        if (!linkInfo?.fullPath) return null;

        try {
            const res = await fetch(`https://gateway.chub.ai/characters/${linkInfo.fullPath}/v2`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });

            if (!res.ok) return null;
            return await res.json();
        } catch {
            return null;
        }
    }

    // ── Version History ─────────────────────────────────────

    get supportsVersionHistory() { return true; }

    async fetchVersionHistory(linkInfo) {
        if (!linkInfo?.fullPath) return [];

        try {
            // Chub uses Git API for version history
            const res = await fetch(`https://api.chub.ai/api/characters/${linkInfo.fullPath}/versions`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });

            if (!res.ok) return [];

            const data = await res.json();
            return (data.versions || []).map(v => ({
                ref: v.sha || v.id,
                date: v.created_at || v.date,
                message: v.message || `Version ${v.version || v.id}`,
                author: v.author || v.user,
            }));
        } catch {
            return [];
        }
    }

    // ── Gallery Download ────────────────────────────────────

    get supportsGallery() { return true; }

    async fetchGalleryImages(linkInfo) {
        if (!linkInfo?.fullPath) return [];

        try {
            // Fetch character data to get gallery info
            const res = await fetch(`https://gateway.chub.ai/characters/${linkInfo.fullPath}/v2`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });

            if (!res.ok) return [];

            const data = await res.json();
            const images = [];

            // Main avatar
            if (data.avatar_url || data.max_res_url) {
                images.push({
                    url: data.max_res_url || data.avatar_url,
                    nsfw: data.nsfw || false,
                });
            }

            // Additional images from data
            if (data.data?.alternate_greetings) {
                // Greeting images would be handled separately
            }

            return images;
        } catch {
            return [];
        }
    }

    // ── Authentication ──────────────────────────────────────

    get hasAuth() { return true; }

    get isAuthenticated() {
        return !!this._token;
    }

    getAuthHeaders() {
        if (!this._token) return {};
        return { 'Authorization': `Bearer ${this._token}` };
    }

    // ── Helpers ─────────────────────────────────────────────

    _normalizeNode(node) {
        return {
            id: node.id || node.fullPath,
            name: node.name || 'Unknown',
            fullPath: node.fullPath,
            avatarUrl: node.avatar_url || '',
            maxResUrl: node.max_res_url || node.avatar_url ||
                `https://avatars.charhub.io/avatars/${node.fullPath}/chara_card_v2.png`,
            rating: node.rating || 0,
            starCount: node.starCount ?? node.ratingCount ?? 0,
            nChats: node.nChats ?? 0,
            topics: node.topics || [],
            tagline: node.tagline || '',
            creator: node.creator || node.user || '',
            // Store raw node for later use
            _raw: node,
        };
    }
}

export default ChubProvider;
