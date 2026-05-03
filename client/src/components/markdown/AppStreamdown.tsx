/**
 * App-owned Markdown renderer.
 *
 * Replaces direct imports of `streamdown` with a wrapper that:
 *   - renders Markdown via `react-markdown` directly
 *   - applies the same plugin set Streamdown uses (GFM + math + KaTeX)
 *   - delegates code fences to `SlimShikiHighlighter`, which
 *     allow-lists languages and lazy-loads each one as its own chunk
 *
 * Boundary rules (enforced by `scripts/check-markdown-imports.ts`):
 *   - No code outside `client/src/lib/shiki/` may import Shiki.
 *   - No code outside this file may import `streamdown`.
 *
 * Drop-in: `<AppStreamdown>{content}</AppStreamdown>` matches the
 * three existing Streamdown call sites (AIChatBox, Chat, WikiArticle).
 */

import { isValidElement, useEffect, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import {
  highlightCode,
  type SupportedTheme,
} from "@/lib/shiki/SlimShikiHighlighter";

interface AppStreamdownProps {
  children: string;
  className?: string;
}

const DEFAULT_THEMES: { light: SupportedTheme; dark: SupportedTheme } = {
  light: "github-light",
  dark: "github-dark",
};

function CodeBlock({
  code,
  language,
}: {
  code: string;
  language: string | undefined;
}) {
  const [light, setLight] = useState<string>("");
  const [dark, setDark] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    void highlightCode({ code, language, themes: DEFAULT_THEMES }).then(
      (result) => {
        if (cancelled) return;
        setLight(result.light);
        setDark(result.dark);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  // Pre-highlight paint: render plain pre/code so text is visible
  // immediately while the highlighter / grammar chunk loads.
  if (!light && !dark) {
    return (
      <pre
        className="my-4 overflow-x-auto rounded-lg border bg-muted p-3 text-sm"
        data-code-block
        data-language={language ?? "text"}
      >
        <code>{code}</code>
      </pre>
    );
  }

  return (
    <div
      className="my-4 overflow-hidden rounded-lg border"
      data-code-block-container
      data-language={language ?? "text"}
    >
      <div
        className="overflow-x-auto p-3 text-sm dark:hidden"
        data-code-block
        data-language={language ?? "text"}
        dangerouslySetInnerHTML={{ __html: light }}
      />
      <div
        className="hidden overflow-x-auto p-3 text-sm dark:block"
        data-code-block
        data-language={language ?? "text"}
        dangerouslySetInnerHTML={{ __html: dark }}
      />
    </div>
  );
}

function extractText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return extractText(props.children);
  }
  return "";
}

export function AppStreamdown({ children, className }: AppStreamdownProps) {
  const components = useMemo(
    () => ({
      pre({ children: preChildren }: { children?: ReactNode }) {
        // react-markdown wraps block code in <pre><code class="language-x">...</code></pre>.
        // We intercept <pre> to route block code through SlimShikiHighlighter.
        if (
          isValidElement(preChildren) &&
          (preChildren.type === "code" || (preChildren.type as { name?: string })?.name === "code")
        ) {
          const codeProps = preChildren.props as {
            className?: string;
            children?: ReactNode;
          };
          const text = extractText(codeProps.children).replace(/\n$/, "");
          const match = /language-([\w+#-]+)/.exec(codeProps.className ?? "");
          const language = match?.[1];
          return <CodeBlock code={text} language={language} />;
        }
        return <pre className="my-4 overflow-x-auto rounded-lg border bg-muted p-3 text-sm">{preChildren}</pre>;
      },
      code({
        className: codeClassName,
        children: codeChildren,
      }: {
        className?: string;
        children?: ReactNode;
      }) {
        // Inline code only (block code is intercepted by `pre` above).
        return (
          <code
            className={`rounded bg-muted px-1 py-0.5 text-sm ${codeClassName ?? ""}`}
          >
            {codeChildren}
          </code>
        );
      },
    }),
    [],
  );

  return (
    <div className={className} data-app-streamdown>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components as never}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
