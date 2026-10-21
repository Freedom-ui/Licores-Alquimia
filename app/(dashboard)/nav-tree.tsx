"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { NavNode } from "./nav-data";
import Icon from "./icons";

function nodeContainsPath(node: NavNode, pathname: string): boolean {
  if (node.href === pathname) return true;
  if (!node.children) return false;
  return node.children.some((child) => nodeContainsPath(child, pathname));
}

export default function NavTree({
  node,
  depth,
}: {
  node: NavNode;
  depth: number;
}) {
  const pathname = usePathname();
  const isActive = node.href === pathname;
  const containsActive = nodeContainsPath(node, pathname);

  const [open, setOpen] = useState(containsActive);

  // Si la ruta activa cambia y ahora cae dentro de este nodo, autoexpandir
  // (ajuste durante el render, sin efecto: ver "You Might Not Need an Effect").
  const [contenia, setContenia] = useState(containsActive);
  if (containsActive !== contenia) {
    setContenia(containsActive);
    if (containsActive) setOpen(true);
  }

  const hasChildren = !!node.children?.length;

  return (
    <div className="nav-node">
      <div
        className={`nav-item depth-${depth} ${isActive ? "active" : ""}`}
        style={{ paddingLeft: 18 + depth * 14 }}
      >
        {node.href ? (
          <Link href={node.href} className="nav-item-label" title={node.label}>
            {node.icon && (
              <span className="icon">
                <Icon name={node.icon} />
              </span>
            )}
            <span>{node.label}</span>
          </Link>
        ) : (
          <span
            className="nav-item-label"
            onClick={() => hasChildren && setOpen((o) => !o)}
            style={{ cursor: hasChildren ? "pointer" : "default" }}
          >
            {node.icon && (
              <span className="icon">
                <Icon name={node.icon} />
              </span>
            )}
            <span>{node.label}</span>
          </span>
        )}

        {hasChildren && (
          <button
            type="button"
            className={`nav-chevron ${open ? "open" : ""}`}
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Contraer" : "Expandir"}
          >
            ›
          </button>
        )}
      </div>

      {hasChildren && open && (
        <div className="nav-children">
          {node.children!.map((child) => (
            <NavTree key={child.href ?? child.label + depth} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}