export type Project = {
    id: string;
    user_id: string;
    name: string;
    parent_project_id: string | null;
    created_at: string;
    updated_at: string;
};

export type ProjectNode = { // 'ProjectNode' is a tree node / an hierarchical representation that contains a Project and its children.
    project: Project;
    children: ProjectNode[];
};
