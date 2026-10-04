import type {
    Project,
    ProjectNode,
} from '@/features/projects/models/project.model';

export function buildProjectTree(projects: Project[]): ProjectNode[] {
    const nodes = new Map<string, ProjectNode>();

    for (const project of projects) { // Pass #1: Map all projects as nodes
        nodes.set(project.id, {
            project,
            children: [],
        });
    }

    const roots: ProjectNode[] = [];

    for (const project of projects) { // Pass #2: Build the tree by linking children to their parents
        const node = nodes.get(project.id);

        if (!node) continue;

        if (!project.parent_project_id) {
            roots.push(node);
            continue;
        }

        const parent = nodes.get(project.parent_project_id);

        if (parent) {
            parent.children.push(node);
        } else {
            roots.push(node);
        }
        /* Why push the node if it has no parent? Because we want to avoid losing data:
            Technically, our foreign key should prevent a project from pointing at a nonexistent parent ...
            But our function doesn't know where its input came from; it's a pure utility that just accepts Project[].
            Anything (a unit test, cached data, future API, partially loaded collection, or bug) could hand it incomplete data.
            Rather than silently losing that project, we promote the orphan to be a *root* project.
         */
    }

    return roots;
}
