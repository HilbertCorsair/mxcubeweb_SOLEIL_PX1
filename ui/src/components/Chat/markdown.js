import MarkdownIt from 'markdown-it';

// Chat messages are markdown. Raw HTML is never rendered (html: false), so a
// message cannot inject markup into the other members' pages.
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

// Only files shared in this chat are shown as images: an image from anywhere
// else would make every member's browser fetch it. Those become links.
const CHAT_FILES = '/ra/chat/files/';

const defaultImage = md.renderer.rules.image;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const src = token.attrGet('src') || '';
  if (!src.includes(CHAT_FILES)) {
    const alt = self.renderInlineAsText(token.children, options, env);
    return `<a href="${md.utils.escapeHtml(
      src,
    )}" target="_blank" rel="noopener noreferrer">${md.utils.escapeHtml(
      alt || src,
    )}</a>`;
  }
  return `<a href="${md.utils.escapeHtml(
    src,
  )}" target="_blank" rel="noopener noreferrer">${defaultImage(
    tokens,
    idx,
    options,
    env,
    self,
  )}</a>`;
};

// Links open in a new tab, so the session page stays where it is
const defaultLinkOpen =
  md.renderer.rules.link_open ||
  ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('target', '_blank');
  tokens[idx].attrSet('rel', 'noopener noreferrer');
  return defaultLinkOpen(tokens, idx, options, env, self);
};

export default function renderMarkdown(text) {
  return md.render(text || '');
}
