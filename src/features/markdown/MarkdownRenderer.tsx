import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { hljs } from '@/lib/highlight';
import { sanitizeHtml } from '@/lib/sanitize';
import { escapeRegex } from '@/lib/constants';
import { CodeBlockActions } from './CodeBlockActions';
import { renderInlinePathReferences } from './inlineReferences';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  searchQuery?: string;
  suppressImages?: boolean;
  onOpenWorkspacePath?: (path: string) => void | Promise<void>;
  pathLinkPrefixes?: string[];
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;

  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="search-highlight">{part}</mark>
    ) : part,
  );
}

function processChildren(
  children: React.ReactNode,
  options: {
    searchQuery?: string;
    pathLinkPrefixes?: string[];
    onOpenWorkspacePath?: (path: string) => void | Promise<void>;
  } = {},
): React.ReactNode {
  const { searchQuery, pathLinkPrefixes, onOpenWorkspacePath } = options;
  const renderPlainText = (text: string) => highlightText(text, searchQuery ?? '');

  return React.Children.map(children, (child) => {
    if (typeof child === 'string') {
      return renderInlinePathReferences(child, {
        prefixes: pathLinkPrefixes,
        onOpenPath: onOpenWorkspacePath,
        renderPlainText,
      });
    }

    if (React.isValidElement<{ children?: React.ReactNode; node?: { tagName?: string } }>(child)) {
      const tagName = typeof child.type === 'string' ? child.type : '';
      const markdownTagName = child.props.node?.tagName ?? '';
      if (tagName === 'code' || tagName === 'pre' || tagName === 'a' || markdownTagName === 'code' || markdownTagName === 'pre' || markdownTagName === 'a') {
        return child;
      }

      if (child.props.children) {
        return React.cloneElement(child, {
          children: processChildren(child.props.children, options),
        });
      }
    }

    return child;
  });
}

function isWorkspacePathLink(href: string): boolean {
  if (!href) return false;
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('#')) return false;
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)) return false;
  if (trimmed.startsWith('//')) return false;
  return true;
}

function decodeWorkspacePathLink(href: string): string {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
}

function CodeBlock({ code, language, highlightedHtml }: {
  code: string;
  language: string;
  highlightedHtml?: string;
}) {
  return (
    <div className="code-block-wrapper">
      <CodeBlockActions code={code} language={language} />
      <pre className="hljs">
        <span className="code-lang">{language}</span>
        {highlightedHtml
          ? <code dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
          : <code>{code}</code>
        }
      </pre>
    </div>
  );
}

export function MarkdownRenderer({ content, className = '', searchQuery, suppressImages, onOpenWorkspacePath, pathLinkPrefixes }: MarkdownRendererProps) {
  const childOptions = useMemo(() => ({ searchQuery, pathLinkPrefixes, onOpenWorkspacePath }), [searchQuery, pathLinkPrefixes, onOpenWorkspacePath]);

  const components = useMemo(() => ({
    p: ({ children }: { children?: React.ReactNode }) => (
      <p>{processChildren(children, childOptions)}</p>
    ),
    li: ({ children }: { children?: React.ReactNode }) => (
      <li>{processChildren(children, childOptions)}</li>
    ),
    td: ({ children }: { children?: React.ReactNode }) => (
      <td>{processChildren(children, childOptions)}</td>
    ),
    th: ({ children }: { children?: React.ReactNode }) => (
      <th>{processChildren(children, childOptions)}</th>
    ),
    code: ({ className: codeClassName, children, ...props }: { className?: string; children?: React.ReactNode }) => {
      const match = /language-(\w+)/.exec(codeClassName || '');
      const lang = match ? match[1] : '';
      const codeString = String(children).replace(/\n$/, '');
      const inline = !codeClassName;

      if (!inline && lang) {
        try {
          const highlighted = hljs.getLanguage(lang)
            ? hljs.highlight(codeString, { language: lang }).value
            : hljs.highlightAuto(codeString).value;

          return (
            <CodeBlock
              code={codeString}
              language={lang}
              highlightedHtml={sanitizeHtml(highlighted)}
            />
          );
        } catch {
          return <CodeBlock code={codeString} language={lang} />;
        }
      }

      return (
        <code className={codeClassName} {...props}>
          {children}
        </code>
      );
    },
    table: ({ children }: { children?: React.ReactNode }) => (
      <div className="table-wrapper">
        <table className="markdown-table">{children}</table>
      </div>
    ),
    a: ({ children, href }: { children?: React.ReactNode; href?: string }) => {
      if (!href) {
        return <span>{children}</span>;
      }

      if (onOpenWorkspacePath && isWorkspacePathLink(href)) {
        return (
          <a
            href={href}
            className="markdown-link"
            onClick={(event) => {
              event.preventDefault();
              Promise.resolve(onOpenWorkspacePath(decodeWorkspacePathLink(href))).catch((error) => {
                console.error('Failed to open workspace path link:', error);
              });
            }}
          >
            {children}
          </a>
        );
      }

      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="markdown-link">
          {children}
        </a>
      );
    },
    ...(suppressImages ? { img: () => null } : {}),
  }), [childOptions, onOpenWorkspacePath, suppressImages]);

  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
