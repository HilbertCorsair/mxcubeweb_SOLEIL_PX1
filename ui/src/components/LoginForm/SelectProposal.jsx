import React from 'react';
import { Modal, Button, Tabs, Tab, Form } from 'react-bootstrap';
import SessionTable from './SessionTable';

class SelectProposal extends React.Component {
  constructor(props) {
    super(props);

    this.handleSelectProposal = this.handleSelectProposal.bind(this);
    this.handleCancel = this.handleCancel.bind(this);
    this.handleOnSessionSelected = this.handleOnSessionSelected.bind(this);

    this.state = {
      pId: null,
      session: null,
      proposal: null,
      filter: '',
      sessions: props.data.proposalList,
      filteredSessions: props.data.proposalList,
    };
  }

  handleCancel() {
    this.props.handleHide();
  }

  handleSelectProposal() {
    this.props.selectProposal(this.state.pId);
  }

  getProposalBySession(session) {
    if (!session) {
      return '';
    }
    return `${session.code}-${session.number}`;
  }

  handleOnSessionSelected(session) {
    this.setState({
      proposal: this.getProposalBySession(session),
      session,
      pId: session.session_id,
    });
  }

  handleChange(event) {
    const filteredSessions = this.state.sessions.filter((s) => {
      return (
        s.title.includes(event.target.value) ||
        s.number.includes(event.target.value) ||
        s.code.includes(event.target.value)
      );
    });

    this.setState({
      filter: event.target.value,
      filteredSessions,
    });
  }

  render() {
    /** sort by start date */
    const sortedlist = this.state.filteredSessions.sort((a, b) =>
      a.actual_start_date < b.actual_start_date ? 1 : -1,
    );

    const { session } = this.state;

    const scheduledSessions = sortedlist.filter(
      (s) => s.is_scheduled_beamline && s.is_scheduled_time,
    );

    const nonScheduledSessions = sortedlist.filter(
      (s) => !(s.is_scheduled_beamline && s.is_scheduled_time),
    );
    return (
      <Modal
        show={this.props.show}
        backdrop="static"
        onHide={this.handleCancel}
      >
        <Modal.Header closeButton>
          <Modal.Title>Select a session</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Control
            type="text"
            id="search_session"
            placeholder="Search"
            value={this.state.filter}
            onChange={this.handleChange.bind(this)}
          />
          <br />

          <Tabs defaultActiveKey="scheduled" id="scheduled-tab">
            <Tab
              eventKey="scheduled"
              title={`Scheduled (${scheduledSessions.length})`}
            >
              <div style={{ overflow: 'auto', height: '550px', padding: 10 }}>
                <SessionTable
                  sessions={scheduledSessions}
                  selectedSessionId={this.state.pId}
                  filter={this.state.filter}
                  onSessionSelected={this.handleOnSessionSelected}
                />
              </div>
            </Tab>
            <Tab
              eventKey="non-scheduled"
              title={`Non scheduled (${nonScheduledSessions.length})`}
            >
              <div style={{ overflow: 'auto', height: '550px', padding: 10 }}>
                <SessionTable
                  showBeamline
                  sessions={nonScheduledSessions}
                  selectedSessionId={this.state.pId}
                  filter={this.state.filter}
                  onSessionSelected={this.handleOnSessionSelected}
                />
              </div>
            </Tab>
          </Tabs>
        </Modal.Body>
        <Modal.Footer>
          {session &&
            session.is_scheduled_beamline &&
            !session.is_scheduled_time && (
              <Button
                variant="warning"
                className="float-end"
                disabled={this.state.pId === null}
                onClick={this.handleSelectProposal}
              >
                Reschedule
              </Button>
            )}
          {session && !session.is_scheduled_beamline && (
            <Button
              variant="danger"
              className="float-end"
              disabled // {this.state.pId === null}
              onClick={this.handleSelectProposal}
            >
              Move here
            </Button>
          )}
          <Button variant="outline-secondary" onClick={this.handleCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="float-end"
            disabled={
              this.state.pId === null ||
              (session && !session.is_scheduled_beamline) ||
              !session.is_scheduled_time
            }
            onClick={this.handleSelectProposal}
          >
            {this.state.proposal === null
              ? 'Select Proposal'
              : `Select ${this.state.proposal}`}
          </Button>
        </Modal.Footer>
      </Modal>
    );
  }
}

export default SelectProposal;
