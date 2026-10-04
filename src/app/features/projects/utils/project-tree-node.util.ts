import type { TreeNode } from 'primeng/api';

import type { ProjectNode } from '@/features/projects/models/project.model';

export function toProjectTreeNodes(
    nodes: ProjectNode[],
): TreeNode[] {
    return nodes.map((node) => {
        const hasChildren = node.children.length > 0;

        return {
            key: node.project.id,
            label: node.project.name,
            leaf: !hasChildren,
            children: hasChildren
                ? toProjectTreeNodes(node.children)
                : undefined,
        };
    });
}

export function findTreeNodeByKey(
    nodes: TreeNode[],
    key: string,
): TreeNode | null {
    for (const node of nodes) {
        if (node.key === key) {
            return node;
        }

        if (node.children?.length) {
            const match = findTreeNodeByKey(node.children, key);

            if (match) {
                return match;
            }
        }
    }

    return null;
}
