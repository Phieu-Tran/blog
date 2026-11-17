// Markdown images load lazily and decode off the main thread; the first image in a post stays eager (likely above the fold).
export default function rehypeLazyImages() {
  return tree => {
    let seen = 0;
    const walk = node => {
      if (node.type === 'element' && node.tagName === 'img') {
        node.properties = { ...node.properties, decoding: 'async', ...(seen++ > 0 ? { loading: 'lazy' } : {}) };
      }
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}
