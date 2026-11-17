// Turns Obsidian callouts ("> [!info] Title") into <blockquote class="callout" data-callout="info">
// with a title line, instead of printing the raw "[!info]" marker.
const MARKER = /^\[!(\w+)\][+-]?[ \t]*([^\n]*)\n?/;

function visit(node, fn) {
  fn(node);
  if (Array.isArray(node.children)) node.children.forEach(child => visit(child, fn));
}

export default function remarkCallouts() {
  return tree => {
    visit(tree, node => {
      if (node.type !== 'blockquote') return;
      const first = node.children?.[0];
      const text = first?.type === 'paragraph' ? first.children?.[0] : null;
      if (!text || text.type !== 'text') return;
      const match = text.value.match(MARKER);
      if (!match) return;

      const type = match[1].toLowerCase();
      const title = match[2].trim() || type;
      text.value = text.value.slice(match[0].length);
      if (!text.value) first.children.shift();
      if (!first.children.length) node.children.shift();

      node.data = { ...node.data, hProperties: { className: ['callout'], 'data-callout': type } };
      node.children.unshift({
        type: 'paragraph',
        data: { hProperties: { className: ['callout-title'] } },
        children: [{ type: 'text', value: title }],
      });
    });
  };
}
