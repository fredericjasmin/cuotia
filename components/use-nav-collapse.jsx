'use client';

// El header pasa solo al menú cuando la barra completa no entra en una línea.
// Un corte fijo (1100 px) no alcanza: el ancho real depende del idioma (los textos en
// francés son más largos), de si la billetera está conectada y de los links que se
// agreguen. Se mide lo que ocupa la barra completa y se compara con el ancho disponible.
// En teléfonos (≤ PHONE_MAX) sigue mandando el CSS, así no hay salto antes de hidratar.
import { useLayoutEffect, useRef, useState } from 'react';

export const PHONE_MAX = 760;
const GROUP_GAP = 24; // aire mínimo entre la marca, los links y las acciones
const SLACK = 8; // margen para que nada quede pegado al borde

function visibleWidth(el) {
  return el ? el.getBoundingClientRect().width : 0;
}

// Ancho natural de los links: se suman uno por uno porque el <nav> puede encogerse.
function linksWidth(nav) {
  if (!nav) return 0;
  const links = [...nav.children].filter((child) => child.getBoundingClientRect().width > 0);
  const gap = parseFloat(getComputedStyle(nav).columnGap) || 0;
  return links.reduce((sum, link) => sum + link.getBoundingClientRect().width, 0) + gap * Math.max(0, links.length - 1);
}

function fullWidth(bar) {
  const brand = bar.querySelector('.brand');
  const nav = bar.querySelector('nav');
  const actions = bar.querySelector('.topbar-actions');
  return visibleWidth(brand) + linksWidth(nav) + visibleWidth(actions) + GROUP_GAP * 2 + SLACK;
}

function availableWidth(bar) {
  const cs = getComputedStyle(bar);
  return bar.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
}

export function useNavCollapse() {
  const ref = useRef(null);
  const needed = useRef(null); // ancho de la barra completa; null = hay que medir
  const [compact, setCompact] = useState(false);
  const [, remeasure] = useState(0);

  // Medir con la barra completa a la vista, antes de pintar (sin parpadeo).
  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    // En teléfonos manda el CSS; la clase sobraría y le ganaría a los ajustes de ≤ 420 px.
    if (window.innerWidth <= PHONE_MAX) {
      if (compact) setCompact(false);
      return;
    }
    if (needed.current !== null) return;
    if (compact) {
      setCompact(false); // mostrar todo un instante para medirlo
      return;
    }
    needed.current = fullWidth(bar);
    setCompact(availableWidth(bar) < needed.current);
  });

  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar || typeof ResizeObserver === 'undefined') return undefined;
    const onResize = () => {
      if (needed.current === null || window.innerWidth <= PHONE_MAX) remeasure((n) => n + 1);
      else setCompact(availableWidth(bar) < needed.current);
    };
    // Si cambia lo que hay en la barra (idioma, billetera, links), volver a medir.
    // El ícono del botón del menú cambia al abrirlo: eso no cuenta.
    const onChange = (mutations) => {
      const relevant = mutations.some((m) => {
        const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        return !el?.closest('.mobile-menu-toggle');
      });
      if (!relevant) return;
      needed.current = null;
      remeasure((n) => n + 1);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(bar);
    const mutationObserver = new MutationObserver(onChange);
    mutationObserver.observe(bar, { childList: true, subtree: true, characterData: true });
    // Las fuentes web cambian el ancho de los textos al terminar de cargar.
    document.fonts?.ready.then(() => { needed.current = null; remeasure((n) => n + 1); });
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  return [ref, compact];
}
