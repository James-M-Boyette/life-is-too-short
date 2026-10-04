import { Injectable, computed, effect, signal } from '@angular/core';

import { AuthStore } from '@/shared/supabase/auth.store';
import { supabase } from '@/shared/supabase/supabase.client';
import type { Project } from '@/features/projects/models/project.model';
import { buildProjectTree } from '@/features/projects/utils/project-tree.util';

@Injectable({ providedIn: 'root' })
export class ProjectsStore {
    readonly projects = signal<Project[]>([]); // What Projects are currently available?
    readonly projectTree = computed(() =>
        // A hierarchical representation of the Projects, built from the flat list of Projects.
        buildProjectTree(this.projects()),
    );
    readonly loading = signal(false); // Are we fetching them?
    readonly error = signal<string | null>(null); // Did fetching them fail?

    readonly projectsById = computed(() => {
        const projects = this.projects();

        return new Map(projects.map((project) => [project.id, project])); // .find() scans the array every time; Map builds a lookup once (when the projects change) and allows individual lookups in O(1) time.
    });

    constructor(private readonly auth: AuthStore) {
        effect(() => {
            const userId = this.auth.userId();

            if (!userId) {
                // If the user loggs out, etc. clear the projects list and don't try to fetch them.
                this.projects.set([]);
                return;
            }

            void this.refresh(); // But if the user is logged in, fetch the projects for them.
            // Note: `void` is used here to ignore the returned Promise, since we don't need to await it in this effect.
            // IOW we don't care about the result of the refresh() call here, since it will update the state signals when it completes.
        });
    }

    async refresh() {
        // Fetch the list of projects for the current user
        this.loading.set(true);
        this.error.set(null);

        try {
            const { data, error } = await supabase
                .from('projects')
                .select('*')
                .order('name', { ascending: true });

            if (error) throw error;

            this.projects.set((data ?? []) as Project[]);
        } catch (e: unknown) {
            this.error.set(e instanceof Error ? e.message : 'Failed to load projects');
            throw e; // re-throw the error so that the caller can handle it if they want to
        } finally {
            this.loading.set(false);
        }
    }

    getProject(projectId: string | null): Project | null {
        if (!projectId) {
            return null;
        }

        return this.projectsById().get(projectId) ?? null;
    }
}
