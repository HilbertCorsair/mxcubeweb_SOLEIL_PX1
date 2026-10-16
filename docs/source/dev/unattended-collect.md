# Unattended collect

An unattended collect runs the whole experiment on a list of samples with nobody at the
beamline. For each sample the queue:

1. mounts the pin,
2. centres the loop optically (two zoom levels),
3. finds the crystal with X-rays (a grid scan, then two line scans),
4. moves to the centred position,
5. collects a data set,
6. unmounts, or leaves the pin on the goniometer when another sample follows.

This page describes how it works across mxcubeweb (UI and server) and mxcubecore (queue
and hardware objects), how to configure it, and what to look at when it goes wrong. The
code described is `main_web` with mxcubecore `main_core`.

## Contents

- [Running an unattended collect](#running-an-unattended-collect)
- [Configuration](#configuration)
- [How it is built](#how-it-is-built)
- [The tasks of one sample](#the-tasks-of-one-sample)
- [Execution, step by step](#execution-step-by-step)
- [Skips, failures and aborts](#skips-failures-and-aborts)
- [The data collection](#the-data-collection)
- [What the UI shows](#what-the-ui-shows)
- [On the video: grid, crystal and heatmap](#on-the-video-grid-crystal-and-heatmap)
- [Logs and timing](#logs-and-timing)
- [Adding unattended collect to another beamline](#adding-unattended-collect-to-another-beamline)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Code map](#code-map)

## Running an unattended collect

1. Log in and sync the samples from LIMS (or the sample changer).
2. In the sample table, select the samples, right-click and choose **Add → Unattended
   collect**. The entry is only there when the beamline has an `unattended_collect`
   object, see [Configuration](#configuration).
3. Fill in the form: oscillation start and range, exposure time, number of images,
   transmission, resolution. An empty field takes the beamline default
   (`default_acquisition_parameters` in `beamline_config.yml`). The same values are used
   for every selected sample.
4. **Add to Queue** puts one unattended collect on each selected sample. **Run Now** adds
   it and starts it at once:
   - with **several samples**, it starts the whole queue (mount, tasks, unmount, for each);
   - with **one sample**, it runs only that sample's task group
     (`Queue.execute_entry_with_id` runs the parent of the task row). That does **not
     mount**: the tasks run on the pin that is already on the goniometer, and the unmount
     task unloads it at the end, since it is a single-entry run. Mount the sample first,
     or use the queue.
5. Start the queue. The confirmation dialog shows *Automatic loop centring (unattended)*
   instead of the usual centring choice, and sets the server's centring method to
   automatic.

While the queue runs, goniometer moves from the UI are disabled (see
`mxcubeweb/core/util/gonioguard.py`). The goniometer takes one command at a time, and
during the run the queue's procedures own it.

## Configuration

Unattended collect is a plug-in hardware object with the role `unattended_collect`. When
the beamline has none, `HWR.beamline.unattended_collect` is `None`. In that case
`Queue.get_available_tasks()` does not offer `unattendedcollect`, and the UI hides the menu
entry.

### beamline_config.yml

Add the role under the procedures:

```yaml
  # Procedures:
  - collect: mxcollect.xml
  ...
  - unattended_collect: px1-unattended-collect.xml
```

and, at the top level, the per-cell colour format the grid overlay uses:

```yaml
mesh_result_format: RGB
```

### px1-unattended-collect.xml

```xml
<object class="SOLEIL.PX1.PX1UnattendedCollect">
  <object href="/px1-xray-centring" role="xray_centring"/>
</object>
```

| Property / role | Meaning |
|---|---|
| `xray_centring` | The `PX1XrayCentring` object that does the work. Without it, `HWR.beamline.xray_centring` is used. |
| `murko` (optional, generic) | A `Murko` object for loop detection by the generic helpers. PX1 does not need it here: `PX1MiniDiff` talks to murko itself. |

`px1-xray-centring.xml` has to be loadable too. Its relevant properties are:

- `omega_increment`: omega step between the grid scan and each line scan (120°).
- `processing`: spot finder, `dials` or `dozor`.

The x-ray centring transmission (`default_transmission_xray`, 25 %) and the optical
centring timeout (`optical_centring_timeout`, 120 s) are class attributes of
`PX1XrayCentring`.

### proxima1: the config the server really reads

`mxgo.sh` starts the server with `./mxcubeweb-server -r ../config` from
`WebApp/mxcubeweb`. So on proxima1 the configuration is
**`/nfs/ruche/share-dev/px1dev/MXCuBE/WebApp/config/`**, outside both repositories.
`git pull` never changes it. Every change made in
`mxcubecore/configuration/soleil_px1/` must also be made there by hand: the
`unattended_collect` and `mesh_result_format` lines in `beamline_config.yml`,
`px1-unattended-collect.xml` and `px1-xray-centring.xml`.

## How it is built

```
UI (React)                       UnattendedCollect.jsx form, UnattendedCollectItem.jsx rows
   │  POST queue (type "UnattendedCollect")
   ▼
mxcubeweb server                 core/components/queue.py
   │  add_unattended_collect()   builds the models + queue entries
   ▼
mxcubecore queue                 model/queue_model_objects.py   UnattendedCollect, UnattendedTask,
   │                                                            UnattendedDataCollection, UNATTENDED_TASKS
   │                             queue_entry/unattended_*.py    the entries that run them
   ▼
HWR.beamline.unattended_collect  abstract/AbstractUnattendedCollect.py
   │                             SOLEIL/PX1/PX1UnattendedCollect.py (PX1)
   │                             mockup/UnattendedCollectMockup.py   (mockup)
   ▼
PX1 hardware                     PX1XrayCentring (grid/line scans, fit, report)
                                 PX1MiniDiff (zoom, murko centring), PX1Cryotong (mount/unmount)
```

The queue knows the steps; the hardware object knows how to do them. The queue layer is
generic: it calls `HWR.beamline.unattended_collect.<method>(context, **kwargs)` and
interprets the result. Everything beamline specific is in the hardware object.

## The tasks of one sample

An unattended collect is one **task group** (`UnattendedCollect`, a `TaskGroup`) under the
sample. It has one child per step, in the order of `UNATTENDED_TASKS` in
`mxcubecore/model/queue_model_objects.py`:

| # | Label | Method called | Needs spots | What PX1 does |
|---|---|---|---|---|
| 1 | Centring (zoom 1) | `optical_centring(context, zoom=1)` | no | Zoom 1, then one automatic (murko) centring, waited to the end. |
| 2 | Centring (zoom 2) | `optical_centring(context, zoom=2)` | no | The same at zoom 2. |
| 3 | Grid scan | `grid_scan(context)` | no | Draws a grid on the loop from the murko analysis and sets the X-ray transmission. Takes snapshots and starts the report, then runs the mesh scan and spot finding. Moves to the best cell and sets `context["found_spots"]`. |
| 4 | Line scan 1 | `line_scan(context, index=0)` | yes | Helical scan at omega + 120°, spot finding, best position along the line. |
| 5 | Line scan 2 | `line_scan(context, index=1)` | yes | The same at omega + 240°. |
| 6 | Finalize centring | `finalize_centring(context)` | yes | Fits the mesh and line results, moves to the centred position and registers it. Saves the report image, then stores the position in `context["centred_position"]`. |
| 7 | Data collection | (an `UnattendedDataCollection`) | yes | A standard data collection at `context["centred_position"]`. |
| 8 | Unmount | `unmount(context, unload=...)` | no | Clears the shapes. Unloads the pin only if this is the last sample. |

Tasks 1–6 and 8 are `UnattendedTask` nodes run by `UnattendedTaskQueueEntry`. Task 7 is an
`UnattendedDataCollection`, a subclass of `DataCollection`, run by
`UnattendedDataCollectionQueueEntry`, a subclass of `DataCollectionQueueEntry`. So the
collection itself, its LIMS records and its processing are exactly those of an ordinary
data collection.

### The context

The tasks of one group share a dictionary, `group.context`. It is reset to
`{"found_spots": False}` when the group starts (`UnattendedCollectQueueEntry.pre_execute`).
Keys used:

| Key | Set by | Read by |
|---|---|---|
| `found_spots` | `grid_scan` (and set to `False` on any failure) | every task with *needs spots* |
| `centred_position` | `finalize_centring` | the data collection |
| `grid_id`, `point_id` | the generic helpers `add_grid` / `add_point` | — (mockup, other beamlines) |

## Execution, step by step

### 1. Mount

The sample entry mounts the pin with `mount_sample()`
(`mxcubecore/queue_entry/base_queue_entry.py`):

- `sample_changer.load(..., wait=True)`. On PX1, `PX1Cryotong` sends a **chained load**
  (CATS *Exchange*) when a pin is already on the goniometer. That is what the previous
  sample's unmount leaves behind.
- The robot action is stored in LIMS. A LIMS error here is logged and ignored; it never
  fails the mount.
- `has_loaded_sample()` is checked after the load. If it is false, the sample is skipped
  ("Sample not loaded") with all its tasks.
- **No queue-level centring.** `_has_unattended_pipeline()` sees an enabled
  `UnattendedCollect` under the sample and sets the centring method to `NONE`. The tasks
  centre the sample themselves. Without this, the queue would start a second centring
  and wait up to `QUEUE_CENTRING_TIMEOUT` (180 s) for an acceptance that never comes.

### 2. The tasks

The queue manager runs the children of the group in order
(`QueueManager.__execute_entry`). For each `UnattendedTaskQueueEntry.execute()`:

1. If the task *needs spots* and `context["found_spots"]` is false, it is **skipped**
   ("… skipped, no spots found").
2. For `unmount`, `unload` is set to `_is_last_sample()`.
3. It calls `HWR.beamline.unattended_collect.<method>(context, **kwargs)`.
4. A return value of `False` means "found nothing". The task is skipped and `found_spots`
   is set to `False`, so the tasks that need spots are skipped too.

`UnattendedDataCollectionQueueEntry.pre_execute()` skips the collection when there are no
spots. Otherwise it sets the acquisition's centred position from
`context["centred_position"]` and runs the normal data collection.

On PX1, `PX1UnattendedCollect` maps the methods onto `PX1XrayCentring`:

- `optical_centring`: `run_optical_centring("zoom1" | "zoom2")`. It waits until no other
  centring runs, moves the zoom, starts one `CENTRING_METHOD_AUTO` centring and waits
  for its real end. It returns whether the centring is valid, and raises on a timeout.
- `grid_scan`: `begin_centring_session(prefix)`, then `run_grid_scan()`, once. The prefix
  is that of the group's data collection, which also names the result directories.
- `line_scan`: `run_line_scan(index)`, once. A scan is never repeated: a sample that does
  not diffract will not show spots on a second try.
- `finalize_centring`: `finalize_centring()`, then the diffractometer position is copied
  into the context.
- `unmount`: `finalize_session(unload)`.

### 3. Unmount, and the next sample

`_is_last_sample()` is true when:

- this is a single-entry run (one entry run on its own, e.g. **Run Now** on one sample), or
- there is no later sample in the queue that is enabled and has an enabled task.

Only then does the unmount task unload the pin. Otherwise the pin stays on the goniometer
and the next sample's mount is a chained load, which saves one robot trip per sample.

## Skips, failures and aborts

| What happens | Effect |
|---|---|
| A method returns `False` (no loop, no spots) | The task is **skipped**. The later tasks that need spots are skipped, and the **unmount still runs**. The queue goes on with the next sample. |
| A method raises | It is logged as "*label* failed". `found_spots` becomes `False` and the task is **skipped** (`QueueSkipEntryException`). Same effect as above. |
| A method raises an error with `abort_queue = True` | The **whole queue stops** (`QueueAbortedException`). The unmount of that sample does not run. `MurkoUnavailable` (defined both in `PX1MiniDiff` and in the generic `Murko.py`) is such an error: without murko no sample can be centred, so going on would only fail every sample. |
| The pin is not on the goniometer after the load | The sample and all its tasks are skipped. |

A failed optical centring does not skip the grid scan: the grid scan does not need spots,
and it decides from what it sees. The tasks that *need spots* depend only on the result of
the grid scan and of the tasks after it.

## The data collection

`Queue._create_unattended_dc()` in mxcubeweb builds it from the form:

- `osc_start`, `osc_range`, `exp_time`, `num_images`, `transmission`, `resolution` and
  `first_image`: from the form, or the beamline defaults when empty.
- `subdir`: the sample name unless given, so each sample writes into its own directory.
- `shape = -1` (no shape), `helical = False`, `mesh = False`.
- Snapshots: `num_snapshots` of the collect object.
- It has `requires_centring = False`: the position comes from the context, not from a
  centring the queue would ask for.

## What the UI shows

- The server sends **one row per task** (`Queue._handle_unattended_collect`). They are tied
  together by the node id of their group and carry the parameters of the group's data
  collection. When the queue is sent back to the server, only the first row
  (`groupIndex` 0) rebuilds the group, which is why it keeps one group per sample.
- `UnattendedCollectItem.jsx` draws them as one item: a header with the group state, the
  progress (*done / total*) and the running task, a parameter table, and the task rows.
  It is used in both the *To do* (`TodoTree.jsx`) and *Current* (`CurrentTree.jsx`) tabs.
- Task states (`ui/src/constants.js`): uncollected, running, collected, failed, and
  **skipped** (`TASK_SKIPPED = 0x10`). Skipped means the queue reached the task and
  deliberately did not run it. `groupSummary()` derives the group state from its rows.
- Elapsed times are counted in the browser from the start signal (`ElapsedTime.jsx`).

## On the video: grid, crystal and heatmap

The overlay is for checking by eye. The scans do not depend on it: the whole grid is
scanned and analysed as before.

- **Grid** - drawn when the grid scan starts (`begin_centring_session`). Its cells are
  **green** where they touch the crystal murko sees and **red** where they do not
  (`show_crystal_on_grid`). The crystal outline is drawn in **cyan**. The HWR log says
  `[UC] n of N grid cells on the crystal`. If murko sends no crystal mask
  (`descriptions["crystal"]["notion_mask"]`), every cell is green and no outline is
  drawn. To see what the murko server sends, run `check_murko_crystal.py`.
- **Mesh heatmap** - after the spot finding, cells with spots get a colour by number
  of spots ('hot' colormap: dark red for few, yellow-white for most). Cells without
  spots keep green/red (`show_spots_on_grid`).
- **Line scans** - one narrow strip per line scan, right of the mesh, labelled `+120`
  and `+240`. Each strip has one cell per image and is coloured the same way. The line
  scans run at other omegas, so they are drawn beside the mesh and not over it
  (`add_line_grid`).
- **Centred point** - the point the collection uses.
- All of it stays on the video until the unmount clears the shapes. A grid is hidden
  while omega is more than `hide_grid_threshold` from its angle, so the overlay
  disappears during the line scans and the collection, and comes back at the mesh angle.
- Grids are drawn while the queue runs, but cannot be selected then (`SampleImage.jsx`).
  The colours come through the standard RGB grid results (`SampleView.set_grid_data`
  -> `grid_result_available`). The outline is the grid attribute `crystal_outline`
  (`DrawGridPlugin.jsx`).

## Logs and timing

- Hardware log (`HWR`): lines tagged **`[UC]`** come from the unattended path. For example
  `[UC] optical centring zoom1 done in 8.2 s` and `[UC] grid drawn at omega …`.
- Lines tagged **`[UC-time]`** give the seconds of each step inside the grid scan
  (`grid: murko grid`, `prepare + report figure`, `report snapshots + omega back`, `mesh`,
  `spot finding`, `heatmap report`), the line scans (`line n: scan`, `spot finding`) and
  the data collection (`collect: ...` from `AbstractCollect.do_collect`, `hook: ...` from
  `PX1Collect`, where `hook: acquisition` also prints the pure exposure time).
- After each sample the queue manager logs one **`[Timing]`** line, also shown in the
  user log:
  `[Timing] sample 1:03: total 4m12s | mount 41s | Centring (zoom 1) 9s | … | Unmount 2s`
- The same numbers are appended to a CSV, one row per sample: date, sample, status,
  total, mount and each phase. It is **`~/MXCuBElogs/sample_timings.csv`** by default, or
  the `timing_csv` property of the queue manager.
- The PX1 X-ray centring report (`report_xraycent.png`, mesh and line heat maps) is saved
  in the centring's process directory, named from the sample prefix.

## Adding unattended collect to another beamline

1. Subclass `AbstractUnattendedCollect` and implement the four abstract methods:
   `optical_centring(context, zoom)`, `grid_scan(context)`, `line_scan(context, index)`,
   `finalize_centring(context)`. Return `False` when there is nothing to go on with.
   Raise an exception with `abort_queue = True` when the queue cannot go on at all.
2. `grid_scan` must set `context["found_spots"]`. `finalize_centring` must leave the
   position to collect at in `context["centred_position"]`; `add_point(context)` does both
   the shape and the context.
3. The base class gives you:
   - `detect_loop()`: loop bounding box from murko, if a `murko` role is configured;
   - `add_grid(context, box)`: a beam-sized grid shape over a box;
   - `add_point(context)`: registers the current position;
   - a default `unmount()`.
4. Configure it under the `unattended_collect` role. The UI entry appears by itself.

`mockup/UnattendedCollectMockup.py`, configured in
`configuration/mockup/unattended-collect-mockup.xml`, is the smallest working example. It
has two properties: `task_time` (seconds per task) and `found_spots` (set it to `False` to
see the skip path).

## Testing

In mxcubecore:

```bash
~/miniconda3/envs/mxcubeweb/bin/python -m pytest test/pytest/test_unattended_collect.py -q
```

The tests check the order of the tasks, that the tasks pass their results to each other,
that "no spots" skips everything up to the unmount, and that the PX1 object calls
`PX1XrayCentring` correctly.

The mockup beamline (`configuration/mockup/qt/beamline_config.yml`) loads
`unattended-collect-mockup.xml`, so the whole UI path can be tried without hardware.

## Troubleshooting

**"Unattended collect" is missing from the right-click menu**
- `HWR.beamline.unattended_collect` is `None`. Check that the `unattended_collect` line
  is in the `beamline_config.yml` the server actually reads; on proxima1 that is
  `WebApp/config/`, see [above](#proxima1-the-config-the-server-really-reads).
- Look in the log for an error loading `PX1UnattendedCollect` or `px1-xray-centring`.
- `GET /mxcube/api/v0.1/queue/available_tasks` must contain `unattendedcollect`. If it
  does and the menu still lacks it, the browser runs an old UI build.

**Every task after the grid scan is skipped**
- The grid scan found no spots. Look at `No result from mesh analysis` in the log and at
  the heat map in the report.

**The queue stopped on the first centring**
- Murko is not reachable (`MurkoUnavailable`). Start murko and run the queue again.

**A centring "did not finish in 120 s" / "previous centring still running"**
- `run_optical_centring` will not start a centring while another runs, and it gives each
  one `optical_centring_timeout` seconds. Check the minidiff (`PX1MiniDiff`) state.

**The pin stays on the goniometer at the end**
- It should only stay there while another enabled sample with an enabled task follows. If
  the last sample was disabled or had all its tasks unticked, the sample before it is the
  last one, and it unloads.

## Code map

mxcubeweb:

| File | Role |
|---|---|
| `mxcubeweb/core/components/queue.py` | `get_available_tasks`, `add_unattended_collect`, `_create_unattended_dc`, `_handle_unattended_collect` |
| `mxcubeweb/core/util/gonioguard.py` | refuses goniometer moves while the queue runs |
| `ui/src/components/Tasks/UnattendedCollect.jsx` | the form |
| `ui/src/containers/SampleGridTableContainer.jsx`, `SampleListViewContainer.jsx` | the right-click menu entry |
| `ui/src/components/SampleQueue/UnattendedCollectItem.jsx` | the group in the queue panel |
| `ui/src/containers/ConfirmCollectDialog.jsx` | sets automatic centring for an unattended run |
| `ui/src/constants.js` | task states, `groupSummary`, `groupedTasks` |

mxcubecore:

| File | Role |
|---|---|
| `mxcubecore/model/queue_model_objects.py` | `UNATTENDED_TASKS`, `UnattendedCollect`, `UnattendedTask`, `UnattendedDataCollection` |
| `mxcubecore/queue_entry/unattended_collect.py` | group entry, resets the context |
| `mxcubecore/queue_entry/unattended_task.py` | runs one task, skip rules, last-sample detection |
| `mxcubecore/queue_entry/unattended_data_collection.py` | the data collection at the centred position |
| `mxcubecore/queue_entry/base_queue_entry.py` | `mount_sample`, `_has_unattended_pipeline` |
| `mxcubecore/HardwareObjects/QueueManager.py` | execution, skip/abort handling, `[Timing]` and the CSV |
| `mxcubecore/HardwareObjects/Beamline.py` | the `unattended_collect` role |
| `mxcubecore/HardwareObjects/abstract/AbstractUnattendedCollect.py` | the interface and helpers |
| `mxcubecore/HardwareObjects/SOLEIL/PX1/PX1UnattendedCollect.py` | PX1 implementation |
| `mxcubecore/HardwareObjects/SOLEIL/PX1/PX1XrayCentring.py` | optical centring, grid and line scans, fit, report |
| `mxcubecore/HardwareObjects/SOLEIL/PX1/PX1MiniDiff.py` | zoom, murko centring, `MurkoUnavailable` |
| `mxcubecore/HardwareObjects/mockup/UnattendedCollectMockup.py` | mockup implementation |
| `mxcubecore/configuration/soleil_px1/px1-unattended-collect.xml` | PX1 configuration |
| `test/pytest/test_unattended_collect.py` | tests |
