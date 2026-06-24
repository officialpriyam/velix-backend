type FilterValue = string | number | boolean | null;
type SupabaseFilter = Record<string, FilterValue | FilterValue[]>;

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const SUPABASE_DB_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

function requireSupabase() {
    if (!SUPABASE_URL || !SUPABASE_DB_KEY) {
        throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY backend environment variables');
    }
}

function toInt(value: unknown, fallback = 0) {
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

class DatabaseService {
    private tableUrl(table: string, filters?: SupabaseFilter, select = '*') {
        requireSupabase();

        const url = new URL(`/rest/v1/${table}`, SUPABASE_URL);
        url.searchParams.set('select', select);

        if (filters) {
            Object.entries(filters).forEach(([key, value]) => {
                if (Array.isArray(value)) {
                    url.searchParams.set(key, `in.(${value.join(',')})`);
                } else if (value !== undefined) {
                    url.searchParams.set(key, `eq.${value}`);
                }
            });
        }

        return url;
    }

    private async request<T>(table: string, init: RequestInit & { filters?: SupabaseFilter; select?: string } = {}) {
        const { filters, select, headers, ...requestInit } = init;
        const res = await fetch(this.tableUrl(table, filters, select), {
            ...requestInit,
            headers: {
                apikey: SUPABASE_DB_KEY,
                Authorization: `Bearer ${SUPABASE_DB_KEY}`,
                'Content-Type': 'application/json',
                Prefer: 'return=representation',
                ...headers
            }
        });

        if (!res.ok) {
            const message = await res.text();
            throw new Error(`Supabase ${table} request failed: ${res.status} ${message}`);
        }

        if (res.status === 204) return undefined as T;
        return res.json() as Promise<T>;
    }

    private async selectOne<T = any>(table: string, filters: SupabaseFilter, select = '*') {
        const rows = await this.request<T[]>(table, { method: 'GET', filters, select, headers: { Accept: 'application/json' } });
        return rows[0] || null;
    }

    private async insert<T = any>(table: string, values: Record<string, unknown> | Record<string, unknown>[]) {
        return this.request<T[]>(table, { method: 'POST', body: JSON.stringify(values) });
    }

    private async update<T = any>(table: string, filters: SupabaseFilter, values: Record<string, unknown>) {
        return this.request<T[]>(table, { method: 'PATCH', filters, body: JSON.stringify(values) });
    }

    private async remove<T = any>(table: string, filters: SupabaseFilter) {
        return this.request<T[]>(table, { method: 'DELETE', filters });
    }

    public async addMessage(sessionId: string, role: string, content: string) {
        return this.insert('messages', { session_id: sessionId, role, content });
    }

    public async getMessagesBySessionId(sessionId: string) {
        const rows = await this.request<any[]>('messages', {
            method: 'GET',
            filters: { session_id: sessionId },
            select: '*'
        });
        return rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    }

    public async createUser(user: { id: string; email: string; name: string }) {
        const affiliate = 'VEL-' + Math.random().toString(36).substring(2, 7).toUpperCase();
        const profileId = Math.floor(1000 + Math.random() * 9000);

        try {
            return await this.insert('users', {
                id: user.id,
                email: user.email,
                name: user.name,
                display_name: user.name,
                credits: 100,
                affiliate_code: affiliate,
                profile_id: profileId,
                role: 'member'
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes('role') || message.includes('column')) {
                return this.insert('users', {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    display_name: user.name,
                    credits: 100,
                    affiliate_code: affiliate,
                    profile_id: profileId
                });
            }
            throw err;
        }
    }

    public async getUserByEmail(email: string) {
        return this.selectOne('users', { email });
    }

    public async getUserById(id: string) {
        try {
            return await this.selectOne('users', { id }, '*');
        } catch {
            // Fallback: select specific columns that definitely exist
            return await this.selectOne(
                'users',
                { id },
                'id,email,name,created_at,display_name,discord_id,credits,affiliate_code,profile_id,history_quick_access,email_notifications,paste_as_file,texture_generation,knowledge_refractor,role'
            );
        }
    }

    public async createProject(project: { id: string; userId: string; name: string; language?: string; model?: string; thumbnail?: string }) {
        const existing = await this.getProjectById(project.id);
        if (existing) {
            return this.update('projects', { id: project.id }, {
                last_updated: new Date().toISOString(),
                model: project.model || existing.model
            });
        }

        return this.insert('projects', {
            id: project.id,
            user_id: project.userId,
            name: project.name,
            language: project.language || 'java',
            model: project.model || null,
            thumbnail: project.thumbnail || null
        });
    }

    public async updateProjectThumbnail(projectId: string, thumbnail: string) {
        return this.update('projects', { id: projectId }, { thumbnail });
    }

    public async getProjectsByUserId(userId: string) {
        const rows = await this.request<any[]>('projects', { method: 'GET', filters: { user_id: userId } });
        return rows.sort((a, b) => String(b.last_updated).localeCompare(String(a.last_updated)));
    }

    public async deleteProject(projectId: string, userId: string) {
        return this.remove('projects', { id: projectId, user_id: userId });
    }

    public async toggleProjectVisibility(projectId: string, userId: string, isPublic: boolean) {
        return this.update('projects', { id: projectId, user_id: userId }, { is_public: isPublic ? 1 : 0 });
    }

    public async generateShareToken(projectId: string, userId: string): Promise<string> {
        const token = require('crypto').randomBytes(16).toString('hex');
        await this.update('projects', { id: projectId, user_id: userId }, { share_token: token });
        return token;
    }

    public async removeShareToken(projectId: string, userId: string) {
        return this.update('projects', { id: projectId, user_id: userId }, { share_token: null });
    }

    public async getProjectByShareToken(token: string) {
        const rows = await this.request<any[]>('projects', { method: 'GET', filters: { share_token: token } });
        return rows?.[0] || null;
    }

    public async renameProject(projectId: string, userId: string, newName: string) {
        return this.update('projects', { id: projectId, user_id: userId }, {
            name: newName,
            last_updated: new Date().toISOString()
        });
    }

    public async updateProjectModel(projectId: string, userId: string, model: string) {
        return this.update('projects', { id: projectId, user_id: userId }, {
            model,
            last_updated: new Date().toISOString()
        });
    }

    public async updateProjectTimestamp(id: string) {
        return this.update('projects', { id }, { last_updated: new Date().toISOString() });
    }

    // ─── Team Members ───
    public async addTeamMember(projectId: string, userId: string, role: 'owner' | 'editor' | 'viewer', invitedBy?: string) {
        return this.insert('team_members', {
            project_id: projectId,
            user_id: userId,
            role,
            invited_by: invitedBy || null
        });
    }

    public async removeTeamMember(projectId: string, userId: string) {
        return this.remove('team_members', { project_id: projectId, user_id: userId });
    }

    public async updateTeamMemberRole(projectId: string, userId: string, role: 'owner' | 'editor' | 'viewer') {
        return this.update('team_members', { project_id: projectId, user_id: userId }, { role });
    }

    public async getTeamMembers(projectId: string) {
        return this.request<any[]>('team_members', { method: 'GET', filters: { project_id: projectId } });
    }

    public async getUserTeamRole(projectId: string, userId: string) {
        return this.selectOne('team_members', { project_id: projectId, user_id: userId });
    }

    public async isProjectAccessible(projectId: string, userId?: string): Promise<{ accessible: boolean; role: string | null; project: any }> {
        const project = await this.getProjectById(projectId);
        if (!project) return { accessible: false, role: null, project: null };

        // Public projects are accessible to everyone
        if (project.is_public === 1 || project.is_public === true) {
            const role = userId ? (userId === project.user_id ? 'owner' : (await this.getUserTeamRole(projectId, userId))?.role || null) : 'viewer';
            return { accessible: true, role, project };
        }

        // Private projects: only owner or team members
        if (!userId) return { accessible: false, role: null, project };

        if (userId === project.user_id) return { accessible: true, role: 'owner', project };

        const membership = await this.getUserTeamRole(projectId, userId);
        if (membership) return { accessible: true, role: membership.role, project };

        return { accessible: false, role: null, project };
    }

    public async getPublicProjects() {
        const projects = await this.request<any[]>('projects', {
            method: 'GET',
            filters: { is_public: 1 }
        });
        const userIds = Array.from(new Set(projects.map(project => project.user_id).filter(Boolean)));
        const users = userIds.length
            ? await this.request<any[]>('users', { method: 'GET', filters: { id: userIds }, select: 'id,name,display_name' })
            : [];
        const userMap = new Map(users.map(user => [user.id, user]));

        return projects
            .map(project => ({
                ...project,
                author_name: userMap.get(project.user_id)?.display_name || userMap.get(project.user_id)?.name || 'Unknown'
            }))
            .sort((a, b) => String(b.last_updated).localeCompare(String(a.last_updated)));
    }

    public async getProjectById(id: string) {
        return this.selectOne('projects', { id });
    }

    public async getAllUsers() {
        const rows = await this.request<any[]>('users', { method: 'GET', select: 'id,email,name,created_at,credits,role,is_banned,ban_reason' });
        return rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    }

    public async deleteUser(id: string) {
        return this.remove('users', { id });
    }

    public async getUserAdminDetails(userId: string) {
        const user = await this.getUserById(userId);
        if (!user) return null;

        const [projects, transactions] = await Promise.all([
            this.getProjectsByUserId(userId),
            this.getCreditsTransactions(userId)
        ]);

        const totalAdded = transactions
            .filter((tx: any) => toInt(tx.amount) > 0)
            .reduce((sum: number, tx: any) => sum + toInt(tx.amount), 0);
        const totalUsed = Math.abs(
            transactions
                .filter((tx: any) => toInt(tx.amount) < 0)
                .reduce((sum: number, tx: any) => sum + toInt(tx.amount), 0)
        );

        return {
            user,
            transactions,
            projects,
            summary: {
                projectsCount: projects.length,
                totalAddedCredits: totalAdded,
                totalUsedCredits: totalUsed
            }
        };
    }

    public async adjustUserCredits(userId: string, delta: number, description: string) {
        const user = await this.getUserById(userId);
        if (!user) return null;
        const nextBalance = Math.max(0, toInt(user.credits) + delta);

        await this.update('users', { id: userId }, { credits: nextBalance });
        await this.insert('credits_transactions', {
            user_id: userId,
            amount: delta,
            type: 'admin_adjustment',
            description
        });

        return nextBalance;
    }

    public async setUserBan(userId: string, banned: boolean, reason?: string) {
        const values: Record<string, unknown> = { is_banned: banned ? 1 : 0 };
        if (reason !== undefined) {
            values.ban_reason = reason || null;
        }
        return this.update('users', { id: userId }, values);
    }

    private parseSettingsConfig(value: string | null | undefined) {
        if (!value) return {};
        try {
            return JSON.parse(value);
        } catch {
            return {};
        }
    }

    public async getSettings() {
        const row = await this.selectOne('admin_settings', { id: 1 });
        const config = this.parseSettingsConfig(row?.oauth_config);
        return {
            oauth: config.oauth ?? null,
            pricing: Array.isArray(config.pricing) ? config.pricing : null,
            payment_gateway: config.payment_gateway ?? null
        };
    }

    public async saveSettings(settings: { oauth?: any; pricing?: any; payment_gateway?: any }) {
        const existing = await this.selectOne('admin_settings', { id: 1 });
        const current = this.parseSettingsConfig(existing?.oauth_config);
        const merged = {
            oauth: settings.oauth ?? current.oauth ?? null,
            pricing: settings.pricing ?? current.pricing ?? null,
            payment_gateway: settings.payment_gateway ?? current.payment_gateway ?? null
        };
        const oauth_config = JSON.stringify(merged);
        if (existing) {
            return this.update('admin_settings', { id: 1 }, { oauth_config, updated_at: new Date().toISOString() });
        }
        return this.insert('admin_settings', { id: 1, oauth_config });
    }

    public async addCompileHistory(sessionId: string, success: boolean, log: string, artifactPath?: string) {
        return this.insert('compile_history', {
            session_id: sessionId,
            success: success ? 1 : 0,
            log,
            artifact_path: artifactPath || null
        });
    }

    public async getCompileHistory(sessionId: string) {
        const rows = await this.request<any[]>('compile_history', { method: 'GET', filters: { session_id: sessionId } });
        return rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 50);
    }

    public async getArtifactById(historyId: number) {
        return this.selectOne<{ session_id: string; artifact_path: string }>('compile_history', { id: historyId });
    }

    public async addDocSubmission(name: string, docsUrl: string, submittedBy: string) {
        return this.insert('doc_submissions', { name, docs_url: docsUrl, submitted_by: submittedBy });
    }

    public async getPendingSubmissions() {
        const rows = await this.request<any[]>('doc_submissions', { method: 'GET', filters: { status: 'pending' } });
        return rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    }

    public async updateSubmissionStatus(id: number, status: string) {
        return this.update('doc_submissions', { id }, { status });
    }

    public async getSubmissionById(id: number) {
        return this.selectOne('doc_submissions', { id });
    }

    public async upsertPluginDoc(doc: { plugin_id: string; name: string; description: string; docs_url: string; content: string; status: string; submitted_by?: string }) {
        const existing = await this.selectOne('plugin_docs', { plugin_id: doc.plugin_id });
        const values = {
            plugin_id: doc.plugin_id,
            name: doc.name,
            description: doc.description,
            docs_url: doc.docs_url,
            content: doc.content,
            status: doc.status,
            submitted_by: doc.submitted_by || null,
            approved_at: new Date().toISOString()
        };

        if (existing) {
            return this.update('plugin_docs', { plugin_id: doc.plugin_id }, values);
        }
        return this.insert('plugin_docs', values);
    }

    public async getApprovedPluginDocs() {
        const rows = await this.request<any[]>('plugin_docs', { method: 'GET', filters: { status: 'approved' } });
        return rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    }

    public async deletePluginDoc(pluginId: string) {
        return this.remove('plugin_docs', { plugin_id: pluginId });
    }

    // ─── Version History ───

    public async createVersion(sessionId: string, commitType: string, filesSnapshot: Record<string, string>, filesChanged: string[], message?: string) {
        return this.insert('project_versions', {
            session_id: sessionId,
            commit_type: commitType,
            message: message || null,
            files_snapshot: filesSnapshot,
            files_changed: filesChanged
        });
    }

    public async getVersions(sessionId: string) {
        const rows = await this.request<any[]>('project_versions', {
            method: 'GET',
            filters: { session_id: sessionId },
            select: 'id,session_id,commit_type,message,files_changed,created_at'
        });
        return rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    }

    public async getVersionById(versionId: number) {
        return this.selectOne('project_versions', { id: versionId });
    }

    public async getVersionsStats(sessionId: string) {
        const rows = await this.request<any[]>('project_versions', {
            method: 'GET',
            filters: { session_id: sessionId },
            select: 'id,commit_type,files_changed,created_at'
        });
        const sorted = rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        const totalCommits = sorted.length;
        const totalFilesChanged = new Set(sorted.flatMap(r => r.files_changed || [])).size;
        const lastCommit = sorted.length > 0 ? sorted[0].created_at : null;
        const aiCommits = sorted.filter(r => r.commit_type === 'ai').length;
        const userCommits = sorted.filter(r => r.commit_type === 'user').length;
        return { totalCommits, totalFilesChanged, lastCommit, aiCommits, userCommits, versions: sorted };
    }

    // ─── Dependencies ───

    public async addDependency(sessionId: string, fileName: string, fileSize: number, storagePath: string) {
        return this.insert('project_dependencies', {
            session_id: sessionId,
            file_name: fileName,
            file_size: fileSize,
            storage_path: storagePath
        });
    }

    public async getDependencies(sessionId: string) {
        const rows = await this.request<any[]>('project_dependencies', {
            method: 'GET',
            filters: { session_id: sessionId },
            select: '*'
        });
        return rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    }

    public async deleteDependency(depId: number) {
        return this.remove('project_dependencies', { id: depId });
    }

    public async getDependencyById(depId: number) {
        return this.selectOne('project_dependencies', { id: depId });
    }

    public async toggleDependencyShade(depId: number, isShaded: boolean) {
        return this.update('project_dependencies', { id: depId }, { is_shaded: isShaded ? 1 : 0 });
    }

    public async getDependenciesSize(sessionId: string) {
        const deps = await this.getDependencies(sessionId);
        return deps.reduce((sum, d) => sum + (d.file_size || 0), 0);
    }

    // ─── Session Settings ───

    public async getProjectSettings(projectId: string) {
        const row = await this.selectOne('projects', { id: projectId }, 'settings');
        if (!row?.settings) return {};
        try {
            return typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings;
        } catch {
            return {};
        }
    }

    public async updateProjectSettings(projectId: string, userId: string, settings: Record<string, any>) {
        return this.update('projects', { id: projectId, user_id: userId }, {
            settings: JSON.stringify(settings),
            last_updated: new Date().toISOString()
        });
    }

    public async updateUserProfile(userId: string, displayName: string, email: string, discordId: string) {
        return this.update('users', { id: userId }, { display_name: displayName, email, discord_id: discordId });
    }

    public async updateUserPreferences(userId: string, prefs: {
        history_quick_access: number;
        email_notifications: number;
        paste_as_file: number;
        texture_generation: number;
        knowledge_refractor: number;
    }) {
        return this.update('users', { id: userId }, prefs);
    }

    public async getPublicProfileByProfileId(profileId: number) {
        return this.selectOne('users', { profile_id: profileId }, 'id,name,display_name,discord_id,profile_id,created_at');
    }

    public async deductCredits(userId: string, amount: number, type: string, description: string) {
        const user = await this.getUserById(userId);
        if (!user) return null;
        const newBalance = Math.max(0, toInt(user.credits) - amount);

        await this.update('users', { id: userId }, { credits: newBalance });
        await this.insert('credits_transactions', { user_id: userId, amount: -amount, type, description });

        return newBalance;
    }

    public async addCredits(userId: string, amount: number, type: string, description: string) {
        const user = await this.getUserById(userId);
        if (!user) return null;
        const newBalance = toInt(user.credits) + amount;

        await this.update('users', { id: userId }, { credits: newBalance });
        await this.insert('credits_transactions', { user_id: userId, amount, type, description });

        return newBalance;
    }

    public async getCreditsTransactions(userId: string) {
        const rows = await this.request<any[]>('credits_transactions', { method: 'GET', filters: { user_id: userId } });
        return rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    }

    public async getTotalMessagesForUserProjects(userId: string) {
        const projects = await this.getProjectsByUserId(userId);
        const ids = projects.map(project => project.id);
        if (ids.length === 0) return 0;

        const rows = await this.request<any[]>('messages', {
            method: 'GET',
            filters: { session_id: ids },
            select: 'id'
        });
        return rows.length;
    }

    public async getUserActivityHeatmap(userId: string) {
        const projects = await this.getProjectsByUserId(userId);
        const projectIds = projects.map(p => p.id);

        const dailyCounts: Record<string, number> = {};

        // Count messages per day
        if (projectIds.length > 0) {
            try {
                const messages = await this.request<any[]>('messages', {
                    method: 'GET',
                    filters: { session_id: projectIds },
                    select: 'created_at'
                });
                for (const msg of messages) {
                    if (msg.created_at) {
                        const day = String(msg.created_at).slice(0, 10);
                        dailyCounts[day] = (dailyCounts[day] || 0) + 1;
                    }
                }
            } catch { /* table may not exist */ }
        }

        // Count compile actions per day
        if (projectIds.length > 0) {
            try {
                const compiles = await this.request<any[]>('compile_history', {
                    method: 'GET',
                    filters: { session_id: projectIds },
                    select: 'created_at'
                });
                for (const c of compiles) {
                    if (c.created_at) {
                        const day = String(c.created_at).slice(0, 10);
                        dailyCounts[day] = (dailyCounts[day] || 0) + 1;
                    }
                }
            } catch { /* table may not exist */ }
        }

        // Count project creations/updates per day
        for (const proj of projects) {
            if (proj.created_at) {
                const day = String(proj.created_at).slice(0, 10);
                dailyCounts[day] = (dailyCounts[day] || 0) + 1;
            }
            if (proj.last_updated && proj.last_updated !== proj.created_at) {
                const day = String(proj.last_updated).slice(0, 10);
                dailyCounts[day] = (dailyCounts[day] || 0) + 1;
            }
        }

        // Count credit transactions per day
        try {
            const txns = await this.request<any[]>('credits_transactions', {
                method: 'GET',
                filters: { user_id: userId },
                select: 'created_at,amount,type'
            });
            for (const tx of txns) {
                if (tx.created_at) {
                    const day = String(tx.created_at).slice(0, 10);
                    dailyCounts[day] = (dailyCounts[day] || 0) + 1;
                }
            }
        } catch { /* table may not exist */ }

        // Convert to array of { date, count }
        const heatmap = Object.entries(dailyCounts).map(([date, count]) => ({ date, count }));

        // Total actions
        const totalActions = heatmap.reduce((sum, d) => sum + d.count, 0);

        // Monthly breakdown for the chart
        const monthlyCounts: Record<string, number> = {};
        for (const { date, count } of heatmap) {
            const monthKey = date.slice(0, 7); // YYYY-MM
            monthlyCounts[monthKey] = (monthlyCounts[monthKey] || 0) + count;
        }

        // Messages vs compiles breakdown
        let messageCount = 0;
        let compileCount = 0;
        if (projectIds.length > 0) {
            try {
                const messages = await this.request<any[]>('messages', {
                    method: 'GET',
                    filters: { session_id: projectIds },
                    select: 'role'
                });
                messageCount = messages.filter(m => m.role === 'user').length;
            } catch { /* ignore */ }
            try {
                const compiles = await this.request<any[]>('compile_history', {
                    method: 'GET',
                    filters: { session_id: projectIds },
                    select: 'id'
                });
                compileCount = compiles.length;
            } catch { /* ignore */ }
        }

        return {
            heatmap,
            totalActions,
            monthlyCounts,
            breakdown: {
                messagesToAI: messageCount,
                manualEdits: compileCount
            }
        };
    }
    // ─── Model Generation History ───

    public async saveModelgenHistory(userId: string, prompt: string, method: string, schematicData: string, creditsUsed: number) {
        return this.insert('modelgen_history', {
            user_id: userId,
            prompt,
            method,
            schematic_data: schematicData,
            credits_used: creditsUsed
        });
    }

    public async getModelgenHistory(userId: string) {
        const rows = await this.request<any[]>('modelgen_history', {
            method: 'GET',
            filters: { user_id: userId },
            select: 'id,user_id,prompt,method,schematic_data,credits_used,created_at'
        });
        return rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    }

    public async getModelgenById(id: number) {
        return this.selectOne('modelgen_history', { id });
    }

    public async deleteModelgenHistory(id: number, userId: string) {
        return this.remove('modelgen_history', { id, user_id: userId });
    }

    // ─── Wiki Pages ───

    public async createWikiPage(projectId: string, title: string, slug: string, content: string = '') {
        return this.insert('wiki_pages', {
            id: `wiki_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            project_id: projectId,
            title,
            slug,
            content,
            sort_order: 0,
            is_public: 0
        });
    }

    public async getWikiPages(projectId: string) {
        const rows = await this.request<any[]>('wiki_pages', {
            method: 'GET',
            filters: { project_id: projectId },
            select: '*'
        });
        return rows.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    }

    public async getWikiPageById(pageId: string) {
        return this.selectOne('wiki_pages', { id: pageId });
    }

    public async updateWikiPage(pageId: string, updates: { title?: string; content?: string; slug?: string; sort_order?: number; is_public?: number }) {
        return this.update('wiki_pages', { id: pageId }, {
            ...updates,
            updated_at: new Date().toISOString()
        });
    }

    public async deleteWikiPage(pageId: string) {
        return this.remove('wiki_pages', { id: pageId });
    }

    public async getPublicWikiPages(projectId: string) {
        const rows = await this.request<any[]>('wiki_pages', {
            method: 'GET',
            filters: { project_id: projectId, is_public: 1 },
            select: 'id,title,slug,sort_order,created_at,updated_at'
        });
        return rows.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    }

    public async getPublicProjectsWithWikis() {
        const rows = await this.request<any[]>('wiki_pages', {
            method: 'GET',
            filters: { is_public: 1 },
            select: 'id,project_id,title,slug,sort_order,created_at'
        });
        return rows;
    }
}

export const dbService = new DatabaseService();
