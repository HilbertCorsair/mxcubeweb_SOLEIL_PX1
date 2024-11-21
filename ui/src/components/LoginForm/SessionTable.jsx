import React from 'react';
import { Table } from 'react-bootstrap';
import { LuExternalLink } from 'react-icons/lu';

import SessionDateTime from './SessionDateTime';
import styles from './SessionTable.module.css';

export default function SessionTable(props) {
  const {
    showBeamline = false,
    sessions,
    selectedSessionId,
    onSessionSelected,
  } = props;

  return (
    <Table bordered hover size="sm" responsive>
      <thead>
        <tr>
          <th>ID</th>
          {showBeamline && <th>Beamline</th>}
          <th>Title</th>
          <th>Start</th>
          <th>End</th>
          <th>Portal</th>
          <th>User</th>
          <th>Logbook</th>
        </tr>
      </thead>
      <tbody>
        {sessions.map((session) => (
          <tr
            key={session.session_id}
            className={styles.row}
            data-selected={selectedSessionId === session.session_id}
            onClick={() => onSessionSelected(session)}
          >
            <td>{`${session.code}-${session.number}`}</td>
            {showBeamline && <td>{session.beamline_name}</td>}
            <td>{session.title}</td>
            <td>
              {session.is_rescheduled ? (
                <>
                  <del className={styles.time}>
                    <SessionDateTime
                      date={session.start_date}
                      time={session.start_time}
                    />
                  </del>
                  <br />
                  <SessionDateTime
                    date={session.actual_start_date}
                    time={session.actual_start_time}
                  />
                </>
              ) : (
                <SessionDateTime
                  date={session.start_date}
                  time={session.start_time}
                />
              )}
            </td>
            <td>
              {session.is_rescheduled ? (
                <>
                  <del className={styles.time}>
                    <SessionDateTime
                      date={session.end_date}
                      time={session.end_time}
                    />
                  </del>
                  <br />
                  <SessionDateTime
                    date={session.actual_end_date}
                    time={session.actual_end_time}
                  />
                </>
              ) : (
                <SessionDateTime
                  date={session.end_date}
                  time={session.end_time}
                />
              )}
            </td>
            <td>
              <a
                href={session.data_portal_URL}
                className="p-1"
                target="_blank"
                rel="noreferrer"
              >
                <LuExternalLink />
              </a>
            </td>
            <td>
              <a
                href={session.user_portal_URL}
                className="p-1"
                target="_blank"
                rel="noreferrer"
              >
                <LuExternalLink />
              </a>
            </td>
            <td>
              <a
                href={session.logbook_URL}
                className="p-1"
                target="_blank"
                rel="noreferrer"
              >
                <LuExternalLink />
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
