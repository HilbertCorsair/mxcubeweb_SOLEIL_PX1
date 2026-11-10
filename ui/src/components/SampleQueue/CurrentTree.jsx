import { Item, Menu } from 'react-contexify';

import { addTask } from '../../actions/queue';
import { showTaskForm } from '../../actions/taskForm';
import { taskGroups } from '../../constants';
import { useAppDispatch, useAppSelector } from '../../ts-store';
import CharacterisationTaskItem from './CharacterisationTaskItem';
import EnergyScanTaskItem from './EnergyScanTaskItem';
import TaskGroupItem from './TaskGroupItem';
import TaskItem from './TaskItem';
import styles from './Tree.module.css';
import UnattendedCollectItem from './UnattendedCollectItem';
import WorkflowTaskItem from './WorkflowTaskItem';
import XRFTaskItem from './XRFTaskItem';

function renderTask(taskData, i, sampleId) {
  switch (taskData.type) {
    case 'Workflow':
    case 'GphlWorkflow': {
      return (
        <WorkflowTaskItem key={taskData.queueID} index={i} data={taskData} />
      );
    }
    case 'xrf_spectrum': {
      return (
        <XRFTaskItem
          key={taskData.queueID}
          index={i}
          data={taskData}
          sampleId={sampleId}
        />
      );
    }
    case 'energy_scan': {
      return (
        <EnergyScanTaskItem
          key={taskData.queueID}
          index={i}
          data={taskData}
          sampleId={sampleId}
        />
      );
    }
    case 'Characterisation': {
      return (
        <CharacterisationTaskItem
          key={taskData.queueID}
          index={i}
          data={taskData}
          sampleId={sampleId}
        />
      );
    }
    default: {
      return (
        <TaskItem
          key={taskData.queueID}
          index={i}
          data={taskData}
          sampleId={sampleId}
        />
      );
    }
  }
}

function CurrentTree(props) {
  const { currentSample } = props;
  const { sampleID: sampleId, tasks = [] } = currentSample;

  const dispatch = useAppDispatch();
  const displayData = useAppSelector((state) => state.queueGUI.displayData);

  const selectedTasks = tasks.filter((t) => displayData[t.queueID]?.selected);

  const isInterleavedAvailable =
    selectedTasks.length > 1 &&
    selectedTasks.every(
      (t) => t.type === 'DataCollection' && !t.parameters.helical,
    );

  function duplicateTask(taskIndex) {
    const task = tasks[taskIndex];

    if (task) {
      const tpars = {
        type: task.type,
        label: task.label,
        ...task.parameters,
      };
      dispatch(addTask([task.sampleID], tpars, false));
    }
  }

  function showInterleavedDialog() {
    dispatch(
      showTaskForm(
        'Interleaved',
        [sampleId],
        {
          type: 'DataCollection',
          parameters: {
            taskIndexList: selectedTasks.map((t) => t.taskIndex),
            wedges: [...selectedTasks],
          },
        },
        -1,
      ),
    );
  }

  return (
    <>
      <div className={styles.listBody}>
        {taskGroups(tasks).map(({ start, rows }) => {
          if (rows[0].type === 'UnattendedCollect') {
            return (
              <UnattendedCollectItem
                key={`group-${rows[0].groupID}`}
                index={start}
                tasks={rows}
              />
            );
          }

          return rows.length > 1 ? (
            <TaskGroupItem key={`group-${rows[0].groupID}`} tasks={rows}>
              {rows.map((taskData, j) =>
                renderTask(taskData, start + j, sampleId),
              )}
            </TaskGroupItem>
          ) : (
            renderTask(rows[0], start, sampleId)
          );
        })}
      </div>

      <Menu id={`queueContextMenu-${sampleId}`}>
        <Item
          onClick={() => showInterleavedDialog()}
          disabled={!isInterleavedAvailable}
        >
          Create interleaved data collection
        </Item>
        <Item onClick={({ props: pp }) => duplicateTask(pp.taskIndex)}>
          Duplicate this item
        </Item>
      </Menu>
    </>
  );
}

export default CurrentTree;
