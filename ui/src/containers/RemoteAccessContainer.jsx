import React from 'react';
import { Container, Card, Form, Row, Col } from 'react-bootstrap';
import { useDispatch, useSelector } from 'react-redux';

import { updateAllowRemote } from '../actions/remoteAccess';
import UserList from '../components/RemoteAccess/UserList';

function RemoteAccessContainer() {
  const dispatch = useDispatch();

  const remoteAccess = useSelector((state) => state.remoteAccess);

  return (
    <Container fluid className="mt-4">
      <Row sm={12} className="d-flex">
        <Col sm={8} className="mb-3">
          <UserList />
        </Col>
        <Col sm={4}>
          <Card className="mb-3">
            <Card.Header>Options</Card.Header>
            <Card.Body>
              <Form.Check
                type="checkbox"
                onChange={(e) => dispatch(updateAllowRemote(e.target.checked))}
                checked={remoteAccess.allowRemote}
                label="Enable remote access"
                id="allow-remote"
              />
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}

export default RemoteAccessContainer;
