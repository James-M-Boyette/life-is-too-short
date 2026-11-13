import MarkdownIt from 'markdown-it';

// Raw HTML is text, not markup. Images are deliberately not embedded in task rows.
// Bind the result through Angular's normal [innerHTML] sanitizer; never bypass security.
const markdown = new MarkdownIt({
    html: false,
    breaks: true,
    linkify: false,
    typographer: false,
}).disable(['image', 'table']);

const renderLink = markdown.renderer.rules['link_open'];
markdown.renderer.rules['link_open'] = (tokens, index, options, env, renderer) => {
    tokens[index].attrSet('target', '_blank');
    tokens[index].attrSet('rel', 'noopener noreferrer');
    return renderLink
        ? renderLink(tokens, index, options, env, renderer)
        : renderer.renderToken(tokens, index, options);
};

export function taskMarkdown(source: string) {
    const tokens = markdown.parse(source, {});
    const parts: string[] = [];
    const collect = (items: typeof tokens) => {
        for (const token of items) {
            if (token.children) collect(token.children);
            else if (['text', 'code_inline', 'code_block', 'fence'].includes(token.type))
                parts.push(token.content);
            else if (token.type === 'softbreak' || token.type === 'hardbreak' || token.block)
                parts.push(' ');
        }
    };
    collect(tokens);
    const plain = parts.join('').replace(/\s+/g, ' ').trim();
    return {
        html: markdown.renderer.render(tokens, markdown.options, {}),
        compact: plain.length > 280 || source.length > 500 || source.split('\n').length > 8,
        preview: plain.length > 240 ? `${plain.slice(0, 240)}…` : plain,
    };
}
