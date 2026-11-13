import React, { useEffect, useRef } from 'react';
import { Button } from 'react-bootstrap';
import { useDispatch, useSelector } from 'react-redux';
import {
  incChatMessageCount,
  resetChatMessageCount,
  respondHandover,
} from '../actions/remoteAccess';
import { fetchChatMessages, sendChatMessage } from '../api/remoteAccess';
import {
  addResponseMessage,
  addUserMessage,
  renderCustomComponent,
  setBadgeCount,
  toggleInputDisabled,
  Widget,
} from 'react-chat-widget';
import Draggable from 'react-draggable';
import { store } from '../store';

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
    <div className="rcw-handover-prompt">
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

/* Show a chat record from the server in the widget. */
export function showChatMessage(record, username) {
  if (record.username === username) {
    addUserMessage(`${record.date} **You:** \n\n ${record.message} \n\n`);
    return;
  }

  if (record.role === 'system') {
    addResponseMessage(`${record.date} _${record.message}_`);
  } else {
    const role = record.role ? ` (${record.role})` : '';
    addResponseMessage(
      `${record.date} **${record.nickname}${role}:** \n\n ${record.message}`,
    );
  }

  if (record.action && record.action.to === username) {
    renderCustomComponent(HandoverPrompt, { handover: record.action }, true);
  }
}

function ChatWidget() {
  const dispatch = useDispatch();

  const muted = Boolean(useSelector((state) => state.login.user.muted));
  const chatMessageCount = useSelector(
    (state) => state.remoteAccess.chatMessageCount,
  );
  const inputDisabled = useRef(false);

  useEffect(() => {
    const { login, remoteAccess } = store.getState(); // non-reactive so effect runs only on mount
    const { username } = login.user;

    (async function loadMessages() {
      const { messages } = await fetchChatMessages();
      let unread = 0;

      messages.forEach((entry) => {
        unread += entry.read ? 0 : 1;
        showChatMessage(entry, username);
      });

      // Show the buttons again for a handover still waiting for this user (e.g. after a reload)
      if (remoteAccess.pending && remoteAccess.pending.to === username) {
        renderCustomComponent(
          HandoverPrompt,
          { handover: remoteAccess.pending },
          true,
        );
      }

      setBadgeCount(unread);
      dispatch(incChatMessageCount(unread));
    })();
  }, [dispatch]);

  useEffect(() => {
    setBadgeCount(chatMessageCount);
  }, [chatMessageCount]);

  // react-chat-widget only offers a toggle for the input state
  useEffect(() => {
    if (muted !== inputDisabled.current) {
      toggleInputDisabled();
      inputDisabled.current = muted;
    }
  }, [muted]);

  return (
    <div className="chat-widget-dragable">
      <Draggable>
        <div onClick={() => dispatch(resetChatMessageCount())}>
          <Widget
            title="Session chat"
            subtitle={muted ? 'You have been muted by staff' : ''}
            senderPlaceHolder={muted ? 'Muted' : 'Type a message...'}
            handleNewUserMessage={(message) => {
              sendChatMessage(message);
            }}
          />
        </div>
      </Draggable>
    </div>
  );
}

export default ChatWidget;
