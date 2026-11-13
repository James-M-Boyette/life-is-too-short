import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { AuthStore } from '@/shared/supabase/auth.store';
import { SUPABASE_CLIENT } from '@/shared/supabase/supabase.client';
import type { Project } from '@/features/projects/models/project.model';
import { buildProjectTree } from '@/features/projects/utils/project-tree.util';

export type CreateProjectInput = {
    name: string;
    parentProjectId: string | null;
};

export type UpdateProjectInput = {
    projectId: string;
    name: string;
    parentProjectId: string | null;
};

type ProjectSession = { userId: string | null; generation: number };

@Injectable({ providedIn: 'root' })
export class ProjectsStore {
    readonly projects = signal<Project[]>([]); // What Projects are currently available?
    readonly projectTree = computed(() =>
        // A hierarchical representation of the Projects, built from the flat list of Projects.
        buildProjectTree(this.projects()),
    );
    // Loading recovery is distinct from CRUD errors already shown in dialogs.
    readonly loadError = signal<string | null>(null);
    readonly loading = signal(false); // Are we fetching them?
    readonly error = signal<string | null>(null); // Did fetching them fail?

    readonly projectsById = computed(() => {
        const projects = this.projects();

        return new Map(projects.map((project) => [project.id, project])); // .find() scans the array every time; Map builds a lookup once (when the projects change) and allows individual lookups in O(1) time.
    });

    private readonly supabase = inject(SUPABASE_CLIENT);
    private owner: string | null | undefined;
    private generation = 0;
    private requestId = 0;
    private latestRefresh = 0;
    private latestErrorOwner = 0;
    private mutationRevision = 0;

    // Synchronize at public entry points too, before Angular's auth effect may run.
    private session(): ProjectSession {
        const userId = this.auth.userId();
        if (userId !== this.owner) {
            this.owner = userId;
            this.generation++;
            this.projects.set([]);
            this.error.set(null);
            this.loadError.set(null);
            this.loading.set(false);
        }
        return { userId, generation: this.generation };
    }

    private isCurrent(session: ProjectSession) {
        return session.generation === this.generation && session.userId === this.auth.userId();
    }

    private applyMutation(
        session: ProjectSession,
        update: (projects: Project[]) => Project[],
    ): void {
        if (!this.isCurrent(session)) return;
        this.mutationRevision++;
        this.projects.update(update);
    }

    private beginRequest() {
        const id = ++this.requestId;
        this.latestErrorOwner = id;
        this.error.set(null);
        return id;
    }

    private recordError(session: ProjectSession, id: number, error: unknown) {
        if (this.isCurrent(session) && id === this.latestErrorOwner) {
            this.error.set(error instanceof Error ? error.message : 'Project operation failed');
        }
    }

    constructor(private readonly auth: AuthStore) {
        effect(() => {
            const session = this.session();
            if (session.userId) {
                void this.refresh().catch(() => {
                    // refresh already records failures belonging to the current request.
                });
            }
        });
    }

    async refresh(): Promise<void> {
        const session = this.session();
        if (!session.userId) return;
        const id = this.beginRequest();
        this.latestRefresh = id;
        const ownsRefresh = () => this.isCurrent(session) && id === this.latestRefresh;
        this.loading.set(true);
        try {
            // A confirmed mutation invalidates this read. Allow one catch-up
            // attempt under the same request so loading and error ownership stay intact.
            for (let attempt = 0; attempt < 2 && ownsRefresh(); attempt++) {
                const revision = this.mutationRevision;
                try {
                    const { data, error } = await this.supabase
                        .from('projects')
                        .select('*')
                        .order('name', { ascending: true });
                    if (error) throw error;
                    if (!ownsRefresh()) return;
                    if (revision !== this.mutationRevision) continue;
                    this.loadError.set(null);
                    this.projects.set((data ?? []) as Project[]);
                    return;
                } catch (error: unknown) {
                    if (ownsRefresh() && revision !== this.mutationRevision) continue;
                    throw error;
                }
            }
        } catch (error: unknown) {
            if (ownsRefresh()) {
                this.loadError.set(
                    error instanceof Error ? error.message : 'Failed to load projects',
                );
            }
            this.recordError(session, id, error);
            throw error;
        } finally {
            if (ownsRefresh()) this.loading.set(false);
        }
    }

    getProject(projectId: string | null): Project | null {
        if (!projectId) {
            return null;
        }

        return this.projectsById().get(projectId) ?? null;
    }

    async createProject(input: CreateProjectInput): Promise<Project> {
        const session = this.session();
        const userId = session.userId;

        if (!userId) {
            throw new Error('User is not authenticated');
        }

        const name = input.name.trim();

        if (!name) {
            throw new Error('Project name is required');
        }

        // Validate that the selected parent belongs to the loaded project set.
        if (input.parentProjectId !== null && !this.projectsById().has(input.parentProjectId)) {
            throw new Error('Selected parent project does not exist');
        }

        const requestId = this.beginRequest();
        try {
            const { data, error } = await this.supabase
                .from('projects')
                .insert({
                    user_id: userId,
                    name,
                    parent_project_id: input.parentProjectId,
                })
                .select('*')
                .single();

            if (error) {
                throw error;
            }

            const createdProject = data as Project;

            this.applyMutation(session, (projects) => [...projects, createdProject]);

            return createdProject;
        } catch (error: unknown) {
            this.recordError(session, requestId, error);
            throw error;
        }
    }

    async updateProject(input: UpdateProjectInput): Promise<Project> {
        const session = this.session();
        const userId = session.userId;

        if (!userId) {
            throw new Error('User is not authenticated');
        }

        const project = this.getProject(input.projectId);

        if (!project) {
            throw new Error('Project does not exist');
        }

        const name = input.name.trim();

        if (!name) {
            throw new Error('Project name is required');
        }

        const parentId = input.parentProjectId;

        if (parentId !== null) {
            const parent = this.getProject(parentId);

            if (!parent) {
                throw new Error('Selected parent project does not exist');
            }

            // Walk upward through the proposed parent's ancestors.
            // Encountering the edited project would create a cycle.
            const visited = new Set<string>();
            let current: Project | null = parent;

            while (current) {
                if (current.id === project.id) {
                    throw new Error('A project cannot be moved beneath itself or its descendants');
                }

                if (visited.has(current.id)) {
                    throw new Error('The project hierarchy contains a cycle');
                }

                visited.add(current.id);

                current = current.parent_project_id
                    ? this.getProject(current.parent_project_id)
                    : null;
            }
        }

        const requestId = this.beginRequest();
        try {
            const { data, error } = await this.supabase
                .from('projects')
                .update({
                    name,
                    parent_project_id: parentId,
                })
                .eq('id', project.id)
                .eq('user_id', userId)
                .select('*')
                .single();

            if (error) {
                throw error;
            }

            const updatedProject = data as Project;

            this.applyMutation(session, (projects) =>
                projects.map((existing) =>
                    existing.id === updatedProject.id ? updatedProject : existing,
                ),
            );

            return updatedProject;
        } catch (error: unknown) {
            this.recordError(session, requestId, error);
            throw error;
        }
    }

    async deleteProject(projectId: string): Promise<void> {
        const session = this.session();
        const userId = session.userId;

        if (!userId) {
            throw new Error('User is not authenticated');
        }

        const project = this.getProject(projectId);

        if (!project) {
            throw new Error('Project does not exist');
        }

        const requestId = this.beginRequest();
        try {
            const { error } = await this.supabase.rpc('delete_project', {
                p_project_id: projectId,
            });

            if (error) {
                throw error;
            }

            // The database operation succeeded. Remove the deleted project
            // from our local state so the sidebar updates immediately.
            this.applyMutation(session, (projects) =>
                projects
                    .filter((existing) => existing.id !== projectId)
                    .map((existing) =>
                        existing.parent_project_id === projectId
                            ? { ...existing, parent_project_id: null }
                            : existing,
                    ),
            );
        } catch (error: unknown) {
            this.recordError(session, requestId, error);
            throw error;
        }
    }
}
