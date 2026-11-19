import React, { useEffect, useRef, useState } from 'react';
import { Button } from 'react-bootstrap';
import { useDispatch, useSelector } from 'react-redux';
import {
  resetChatMessageCount,
  respondHandover,
  setChatMessages,
} from '../../actions/remoteAccess';
import {
  fetchChatMessages,
  sendChatFile,
  sendChatMessage,
} from '../../api/remoteAccess';
import renderMarkdown from './markdown';
import styles from './ChatPanel.module.css';

/* Accept/Decline buttons for a control handover addressed to the current user.
   They disappear once the handover is no longer pending. */
function HandoverPrompt({ handover }) {
  const dispatch = useDispatch();
  const pending = useSelector((state) => state.remoteAccess.pending);

  const isPending =
    pending &&
    pending.kind === handover.kind &&
    pending.from === handover.from &&
    pending.to === handover.to;

  if (!isPending) {
    return null;
  }

  return (
    <div className={styles.handover}>
      <Button
        size="sm"
        variant="success"
        className="me-2"
        onClick={() => dispatch(respondHandover(true))}
      >
        Accept
      </Button>
      <Button
        size="sm"
        variant="outline-danger"
        onClick={() => dispatch(respondHandover(false))}
      >
        Decline
      </Button>
    </div>
  );
}

function ChatMessage({ record, username }) {
  const own = record.username === username;
  const system = record.role === 'system';
  const role = record.role && !system ? ` (${record.role})` : '';

  let className = styles.message;
  if (system) {
    className = `${styles.message} ${styles.system}`;
  } else if (own) {
    className = `${styles.message} ${styles.own}`;
  }

  return (
    <div className={className}>
      {!system && (
        <div className={styles.meta}>
          <b>{own ? 'You' : `${record.nickname}${role}`}</b>
          <span className={styles.date}>{record.date}</span>
        </div>
      )}
      <div
        className={styles.body}
        // markdown-it with html disabled: the text is escaped
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: renderMarkdown(record.message) }}
      />
      {system && <span className={styles.date}>{record.date}</span>}
      {record.action && record.action.to === username && (
        <HandoverPrompt handover={record.action} />
      )}
    </div>
  );
}

/* The session chat, docked under the sample view. Markdown messages, files
   shared by the paperclip, drag and drop or paste. */
function ChatPanel() {
  const dispatch = useDispatch();
  const username = useSelector((state) => state.login.user.username);
  const muted = Boolean(useSelector((state) => state.login.user.muted));
  const messages = useSelector((state) => state.remoteAccess.chatMessages);
  const unread = useSelector((state) => state.remoteAccess.chatMessageCount);
  const pending = useSelector((state) => state.remoteAccess.pending);
  // The history has no handover actions: after a reload, a handover still
  // waiting for this user gets its buttons at the end
  const pendingPrompt =
    pending &&
    pending.to === username &&
    !messages.some(
      (m) =>
        m.action &&
        m.action.kind === pending.kind &&
        m.action.from === pending.from,
    );

  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => {
    (async function loadMessages() {
      const { messages: history } = await fetchChatMessages();
      dispatch(setChatMessages(history));
    })();
  }, [dispatch]);

  // The panel is always in view: what arrives is read
  useEffect(() => {
    if (unread > 0 && !document.hidden) {
      dispatch(resetChatMessageCount());
    }
  }, [unread, dispatch]);

  async function send() {
    const message = text.trim();
    if (!message || muted) {
      return;
    }
    setText('');
    await sendChatMessage(message);
  }

  async function upload(files) {
    if (muted || files.length === 0) {
      return;
    }
    setUploading(true);
    setError(null);
    try {
      for (const file of files) {
        await sendChatFile(file); // eslint-disable-line no-await-in-loop
      }
    } catch (error_) {
      setError(error_.text || error_.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function onPaste(e) {
    const files = [...e.clipboardData.files];
    if (files.length > 0) {
      e.preventDefault();
      upload(files);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    upload([...e.dataTransfer.files]);
  }

  return (
    <div
      className={`${styles.panel} ${dragging ? styles.dragging : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(!muted);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className={styles.title}>
        <span className="fas fa-comments me-2" />
        Session chat
        {muted && (
          <span className={styles.mutedNote}>You have been muted by staff</span>
        )}
      </div>
      {/* column-reverse keeps the list scrolled to the newest message,
          unless the reader has scrolled up */}
      <div className={styles.scroller}>
        <div className={styles.messages}>
          {messages.map((record) => (
            <ChatMessage key={record.key} record={record} username={username} />
          ))}
          {pendingPrompt && <HandoverPrompt handover={pending} />}
        </div>
      </div>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.composer}>
        <Button
          variant="outline-secondary"
          size="sm"
          title="Share a file (or drop / paste it here)"
          disabled={muted || uploading}
          onClick={() => fileInput.current.click()}
        >
          <span
            className={
              uploading ? 'fas fa-spinner fa-spin' : 'fas fa-paperclip'
            }
          />
        </Button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          aria-label="Share a file"
          onChange={(e) => {
            upload([...e.target.files]);
            e.target.value = '';
          }}
        />
        <textarea
          className={`form-control form-control-sm ${styles.input}`}
          aria-label="Chat message"
          rows={Math.min(6, text.split('\n').length)}
          placeholder={
            muted
              ? 'Muted'
              : 'Message (markdown: **bold**, `code`, ```code block```) - Shift+Enter for a new line'
          }
          disabled={muted}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
        <Button
          size="sm"
          disabled={muted || !text.trim()}
          onClick={send}
          title="Send (Enter)"
        >
          <span className="fas fa-paper-plane" />
        </Button>
      </div>
    </div>
  );
}

export default ChatPanel;
