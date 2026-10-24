// A few browser extensions add marker attributes to existing or newly parsed
// elements before React hydrates the page. Remove only those extension-owned
// markers in development so they cannot make the server and browser DOM differ.
if (process.env.NODE_ENV === 'development') {
  const extensionMarker = /^(?:bis_skin_checked|bis_register|__processed_[\w-]+)$/i;

  const cleanElement = (element) => {
    for (const attribute of [...element.attributes]) {
      if (extensionMarker.test(attribute.name)) element.removeAttribute(attribute.name);
    }
  };

  const cleanTree = (node) => {
    if (!(node instanceof Element)) return;
    cleanElement(node);
    for (const element of node.querySelectorAll('*')) cleanElement(element);
  };

  cleanTree(document.documentElement);

  // The browser extension can run after the first cleanup. Observe its DOM
  // changes and remove its marker before React reaches those nodes to hydrate.
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes' && extensionMarker.test(record.attributeName || '')) {
        cleanElement(record.target);
      }
      for (const node of record.addedNodes || []) cleanTree(node);
    }
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
  });
}
