import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Row, Col, Button, Card, Badge } from 'react-bootstrap';
import {
  cancelControlRequest,
  logoutUser,
  muteUser,
  offerControl,
  requestControl,
} from '../../actions/remoteAccess';

const ROLE_VARIANT = { staff: 'danger', user: 'primary', guest: 'secondary' };

function MemberActions({ me, member }) {
  const dispatch = useDispatch();

  if (member.username === me.username) {
    return null;
  }

  return (
    <>
      {me.role === 'user' && me.inControl && (
        <Button
          size="sm"
          variant="outline-primary"
          className="me-2"
          onClick={() => dispatch(offerControl(member.username))}
        >
          Offer control
        </Button>
      )}
      {me.role === 'staff' && (
        <Button
          size="sm"
          variant="outline-secondary"
          className="me-2"
          onClick={() => dispatch(muteUser(member.username, !member.muted))}
        >
          {member.muted ? 'Unmute' : 'Mute'}
        </Button>
      )}
      {me.role === 'staff' && member.role !== 'staff' && (
        <Button
          size="sm"
          variant="outline-danger"
          onClick={() => dispatch(logoutUser(member.username))}
        >
          Disconnect
        </Button>
      )}
    </>
  );
}

function UserList() {
  const dispatch = useDispatch();

  const me = useSelector((state) => state.login.user);
  const members = useSelector((state) => state.remoteAccess.members) || [];
  const pending = useSelector((state) => state.remoteAccess.pending);

  return (
    <Card className="mb-3">
      <Card.Header>Session members</Card.Header>
      <Card.Body>
        <Row>
          <Col sm={5}>
            <b>Name</b>
          </Col>
          <Col sm={2}>
            <b>Host</b>
          </Col>
          <Col sm={5}>
            <span>&nbsp;</span>
          </Col>
        </Row>
        {members.map((member) => (
          <Row key={member.username} className="mt-3 align-items-center">
            <Col sm={5}>
              {member.nickname || <em>Not provided</em>}{' '}
              <small className="text-muted">({member.username})</small>{' '}
              <Badge bg={ROLE_VARIANT[member.role]}>{member.role}</Badge>{' '}
              {member.inControl && (
                <span className="fas fa-gamepad" title="In control" />
              )}{' '}
              {member.muted && (
                <span className="fas fa-volume-mute" title="Muted" />
              )}{' '}
              {member.username === me.username && <em>(You)</em>}
            </Col>
            <Col sm={2}>{member.ip}</Col>
            <Col sm={5}>
              <MemberActions me={me} member={member} />
            </Col>
          </Row>
        ))}
      </Card.Body>
      {(me.role === 'guest' || pending?.from === me.username) && (
        <Card.Footer>
          {pending?.from === me.username ? (
            <Button
              size="sm"
              variant="outline-secondary"
              onClick={() => dispatch(cancelControlRequest())}
            >
              Cancel pending request
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline-primary"
              disabled={Boolean(pending)}
              onClick={() => dispatch(requestControl())}
            >
              Request control
            </Button>
          )}
        </Card.Footer>
      )}
    </Card>
  );
}

export default UserList;
