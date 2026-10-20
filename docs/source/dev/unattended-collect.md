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

Left: what runs. Right: where it lives. Paths are relative to the repo named in each box
header; `:N` is a line number at the time of writing. Arrows going up are signals that
update the browser.

```
╔═══════════════════════════════════════════════════════════════════════════════════════════════╗
║ 1. UI (React)                                                          mxcubeweb  ui/src/     ║
╠═══════════════════════════════════════════════════════════════════════════════════════════════╣
║ Right-click a sample → Add → "Unattended collect"     containers/SampleGridTableContainer.jsx ║
║   shown only if defaultParameters.unattendedcollect   containers/SampleListViewContainer.jsx  ║
║                    │                                                                          ║
║                    ▼                                                                          ║
║ Form (redux-form 'unattendedcollect')                 components/Tasks/UnattendedCollect.jsx  ║
║   osc start/range, exposure, n images, transmission, resolution                               ║
║   Add to Queue / Run Now → addToQueue() → addTask({type:'UnattendedCollect', shape:-1, ...})  ║
║                    │                                                                          ║
║ Start queue → containers/ConfirmCollectDialog.jsx: "Automatic loop centring (unattended)"     ║
║   (Run Now on one sample = that group only, NO mount)                                         ║
╚════════════════════│══════════════════════════════════════════════════════════▲═══════════════╝
                     │ POST queue/  (one task per sample)   routes/queue.py      │ socket.io:
                     │ PUT  queue/start                                          │ queue status,
                     ▼                                                           │ shapes, grid results
╔═══════════════════════════════════════════════════════════════════════════════════════════════╗
║ 2. mxcubeweb server                                 mxcubeweb  core/components/queue.py       ║
╠═══════════════════════════════════════════════════════════════════════════════════════════════╣
║ get_available_tasks()  :2661   offers 'unattendedcollect' iff HWR.beamline.unattended_collect ║
║ _queue_add_item_rec    :1104   item_t == "UnattendedCollect" (groupIndex 0)                   ║
║                                → add_unattended_collect()                                     ║
║ add_unattended_collect :1705                                                                  ║
║   ├─ qmo.UnattendedCollect()           + UnattendedCollectQueueEntry   → under the sample     ║
║   ├─ for (label, method, kwargs, needs_spots) in qmo.UNATTENDED_TASKS:                        ║
║   │     method != "collect" → qmo.UnattendedTask        + UnattendedTaskQueueEntry            ║
║   │     method == "collect" → _create_unattended_dc :1748                                     ║
║   │                            form params ∪ defaults, subdir = sample name,                  ║
║   │                            take_snapshots = num_snapshots                                 ║
║   │                            → qmo.UnattendedDataCollection + UnattendedDataCollectionQE    ║
║   └─ on error: delete the group                                                               ║
║ _handle_unattended_collect :574  → one row per task in the queue panel                        ║
║                                    (ui UnattendedCollectItem.jsx)                             ║
║ core/components/sampleview.py: shapesChanged → _emit_shapes_updated,                          ║
║                                newGridResult → handle_grid_result (grid colours) ─────────────╫──▲
╚════════════════════│══════════════════════════════════════════════════════════════════════════╝
                     │ HWR.beamline.queue_manager.execute()
                     ▼
╔═══════════════════════════════════════════════════════════════════════════════════════════════╗
║ 3. mxcubecore queue                                                   mxcubecore  mxcubecore/ ║
╠═══════════════════════════════════════════════════════════════════════════════════════════════╣
║ model/queue_model_objects.py  UNATTENDED_TASKS                                                ║
║   label               method              kwargs      needs_spots                             ║
║   Centring (zoom 1)   optical_centring    zoom=1      no                                      ║
║   Centring (zoom 2)   optical_centring    zoom=2      no                                      ║
║   Grid scan           grid_scan           –           no   ← sets context["found_spots"]      ║
║   Line scan 1 / 2     line_scan           index=0/1   yes                                     ║
║   Finalize centring   finalize_centring   –           yes  ← sets context["centred_position"] ║
║   Data collection     collect             –           yes  (a real DataCollection)            ║
║   Unmount             unmount             –           no   (always runs)                      ║
║                                                                                               ║
║ SampleQueueEntry.execute → mount_sample()        queue_entry/base_queue_entry.py              ║
║   sample_view.clear_all → sample_changer.load(wait=True) → LIMS robot action                  ║
║   not loaded → QueueSkipEntryException; _has_unattended_pipeline() → centring NONE            ║
║                    │                                                                          ║
║ UnattendedCollectQueueEntry.pre_execute          queue_entry/unattended_collect.py            ║
║   context = {"found_spots": False}   (shared by all children)                                 ║
║                    │                                                                          ║
║ UnattendedTaskQueueEntry.execute                 queue_entry/unattended_task.py               ║
║   needs_spots and not found_spots → SKIPPED                                                   ║
║   unmount → kwargs["unload"] = _is_last_sample()                                              ║
║   result = getattr(HWR.beamline.unattended_collect, method)(context, **kwargs)                ║
║     False      → found_spots=False, SKIPPED                                                   ║
║     exception  → found_spots=False, SKIPPED   (abort_queue, e.g. MurkoUnavailable → ABORT)    ║
║                                                                                               ║
║ UnattendedDataCollectionQueueEntry.pre_execute   queue_entry/unattended_data_collection.py    ║
║   no spots → SKIPPED; else centred_position = CentredPosition(context["centred_position"])    ║
║   → standard DataCollectionQueueEntry → HWR.beamline.collect.collect() ────────────┐          ║
║                                                                                    │          ║
║ QueueManager after each sample: [Timing] log + ~/MXCuBElogs/sample_timings.csv     │          ║
╚════════════════════│═══════════════════════════════════════════════════════════════│══════════╝
                     │ method(context, **kwargs)                                     │
                     ▼                                                               │
╔═════════════════════════════════════════════════════════════════════╗              │
║ 4. HWR.beamline.unattended_collect   (role in beamline_config.yml)  ║              │
║                                      mxcubecore HardwareObjects/    ║              │
╠═════════════════════════════════════════════════════════════════════╣              │
║ abstract/AbstractUnattendedCollect.py      the contract             ║              │
║   optical_centring(ctx, zoom) → bool                                ║              │
║   grid_scan(ctx) → bool       line_scan(ctx, index) → bool          ║              │
║   finalize_centring(ctx) → bool        unmount(ctx, unload)         ║              │
║   helpers: murko, detect_loop, add_grid, add_point (generic BLs)    ║              │
║                                                                     ║              │
║ mockup/UnattendedCollectMockup.py   fake results (tests, mockup BL) ║              │
║                                                                     ║              │
║ SOLEIL/PX1/PX1UnattendedCollect.py  thin adapter → xray_centring    ║              │
║   optical_centring  → run_optical_centring(f"zoom{zoom}")           ║              │
║   grid_scan         → begin_centring_session(prefix),               ║              │
║                       then run_grid_scan()                          ║              │
║   line_scan         → run_line_scan(index)                          ║              │
║   finalize_centring → finalize_centring(), then                     ║              │
║                       ctx["centred_position"] =                     ║              │
║                       diffractometer.get_positions()                ║              │
║   unmount           → finalize_session(unload)                      ║              │
╚════════════════════│════════════════════════════════════════════════╝              │
                     ▼                                                               ▼
╔═══════════════════════════════════════════════════════════════════════════════════════════════╗
║ 5. PX1 hardware objects                   mxcubecore HardwareObjects/SOLEIL/PX1/              ║
╠═══════════════════════════════════════════════════════════════════════════════════════════════╣
║ PX1XrayCentring.py                                                                            ║
║   run_optical_centring   move_zoom → start_centring_method(AUTO) → minidiff murko → wait      ║
║   begin_centring_session clear shapes, fresh frame, generateGridFromAnalysis (murko aoi_bbox) ║
║        → Grid (pinned) on HWR.beamline.sample_view, show_crystal_on_grid                      ║
║        → report snapshots (2 × 120° rotations)                                                ║
║   run_grid_scan          run_mesh (COLLECT phase, Tango collect server raster)                ║
║        → do_mesh_analysis (dozor/dials) → heatmap → show_spots_on_shape                       ║
║        → move_best_position                                                                   ║
║   run_line_scan          run_helical (+120°/+240°) → add_line → scan → analysis               ║
║        → show_spots_on_shape on the line's 1D grid                                            ║
║   finalize_centring      calculate_center (sine fit) → move motors                            ║
║        → register_center_position (Point shape) → report figure                               ║
║   finalize_session       clear shapes, reset; unload ? sc.unload(wash=False) : keep the pin   ║
║                                                                                               ║
║ PX1MiniDiff.py    zoom, phases, murko centring (px1_center_murko, estimate_click_murko),      ║
║                   crystal_mask                                                                ║
║ PX1Collect.py     data_collection_hook inside smargon.procedure("data collection"):           ║
║                   prepare_devices_for_collection → _wait_devices_settled → acquisition        ║
║                   → omega back → thumbnails/LIMS; _take_crystal_snapshot (CENTRING, light)    ║
║ PX1Cryotong.py    load (chained CATS Exchange) / unload                                       ║
║ Smargon           every goniometer move goes through its gate/procedure                       ║
║ SampleView.py     Grid / Point shapes → emits shapesChanged / newGridResult ──────────────────╫─▲ to 2
║ (mxcubecore HardwareObjects/SampleView.py)                                                    ║
╚═══════════════════════════════════════════════════════════════════════════════════════════════╝
```

The queue knows the steps; the hardware object knows how to do them. The queue layer is
generic: it calls `HWR.beamline.unattended_collect.<method>(context, **kwargs)` and
interprets the result. Everything beamline specific is in the hardware object.

What the diagram shows:

- **Two exits from the queue.** Seven of the eight tasks go through
  `unattended_collect`. The data collection does not: it goes to the standard `collect`
  object (`AbstractCollect.do_collect` → `PX1Collect`), like any data collection.
- **`context` is the only state passed between tasks.** `grid_scan` writes
  `found_spots`, `finalize_centring` writes `centred_position`, and the data collection
  reads both.
- **The overlay goes back up via signals, not the queue.** The shapes are added to
  `HWR.beamline.sample_view`, whose `shapesChanged` / `newGridResult` signals mxcubeweb
  forwards to the browser. The centring must therefore draw on that object, not on a
  separate graphics manager.
- **Only boxes 4 and 5 are beamline specific.** Another beamline writes its own
  `AbstractUnattendedCollect` subclass and adds the `unattended_collect:` role; boxes 1–3
  do not change.

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
- Snapshots: `num_snapshots` of the collect object, 2 on PX1 (`mxcollect.xml`). The web
  puts it in the acquisition parameters (`take_snapshots`), which is what the collect
  reads. Before the collection, `AbstractCollect.take_crystal_snapshots` logs
  `Collection: N crystal snapshot(s)`, takes one, turns omega by 90° and takes the next;
  `do_collect` then moves back to the centred position.
  `PX1Collect._take_crystal_snapshot` lights the sample the way the 3-click centring
  does: `PX1MiniDiff.prepare_centring` (CENTRING phase, then the zoom's light level,
  waited for) and back to the centred position if the phase changed; then a fresh
  camera frame, saved with `takePictureAnalysis` like the report snapshots. Each one
  logs `[UC] snapshot <file>: phase …, N bytes`; a snapshot that cannot be lit is a
  warning in the UI log. The files are `<prefix>_<run>_<n>.snapshot.jpeg` in the
  archive directory. The report snapshots
  of the X-ray centring are JPG too (`<prefix>_snapshot_0.jpg`, `_120.jpg`, `_240.jpg`).
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
  drawn. To see what the murko server sends, run
  `scripts/murko/check_murko_crystal.py` from the mxcubecore checkout.
- **Mesh heatmap** - after the spot finding, cells with spots get a colour by number
  of spots ('hot' colormap: dark red for few, yellow-white for most). Cells without
  spots keep green/red (`show_spots_on_shape`).
- **Line scans** - per line scan, a `Line` and over it a one-column `Grid` (the 1D
  grid), labelled `+120` and `+240`, drawn when its scan starts (`add_line`). Both are
  built from the start and end programmed for that scan (`run_helical`) at the scan's
  omega: at that omega they lie on the beam column, over the scanned line. The 1D grid
  is as wide as the beam, one cell per image, and gets the heatmap of the line's spots
  like the mesh. The web draws the line thin (`makeScanLine` in `shapes.js`), under its
  1D grid.
- **Centred point** - the point the collection uses.
- **Style** - the Draw Grid style: solid green outline, dashed cell lines, square cells.
- **Following the sample** - the shapes are kept in motor positions and redrawn on every
  Smargon move (`SampleView._update_shape_positions` ->
  `PX1MiniDiff.motor_positions_to_screen`). The collect server rasters the mesh on the
  Smargon `x/y/z` axes, on top of `xOffset/yOffset/zOffset` (`zero_sgonaxis` puts them
  back to 0 afterwards), so the transform adds them: the grid moves with the sample cell
  by cell.
- **Locked on the sample** - each shape is kept as motor positions on the plane it
  scans and drawn as its projection at the current omega. The mesh grid's corners are
  re-anchored on the mesh program in `prepare` (`mesh_x_start/end`, `calc_y_z` of
  `mesh_y_start/end` at the mesh omega), the convention the line scans use: the HWR log
  says `[UC] grid corners: clicked ... -> scanned ...`, and after each line scan
  `[UC] line n at omega w: grid y ..., line y ...`. The rotation axis is horizontal on
  the video, so a grid keeps its x range and its height is the projection of its two
  corners: flat at 90°, mirrored past it (rows drawn bottom-up, `DrawGridPlugin`). The
  lines and 1D grids shorten the same way.
- **Layers** - all of it stays on the video until the unmount clears the shapes. An
  ordinary grid is hidden while omega is more than `hide_grid_threshold` from its angle.
  The shapes of the unattended collect are **pinned** (`Shape.pinned`, set in
  `begin_centring_session` and `add_line`): they keep following the sample at every
  omega, with a `fade` of 0 at their own omega and up to 1 facing away
  (`Shape.update_position`). The web draws a faded shape in grey and more transparent,
  without crystal outline or label, and draws the grids and lines least faded last: the
  shapes at the current omega are on top and fully lit.
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

**No overlay at all on the video, not even the beam crosshair**
- The sample view draws nothing on a camera that is not the OAV. With argussight, the
  OAV is the stream flagged `oav: true` in `ARGUSSIGHT_CAMERAS` (`server.yaml`), or the
  first stream when none is flagged. Flag the OAV stream and reload the page.
- If the crosshair is there but not the grids, look for `[UC] overlay: N shapes` in the
  log (written by the finalize centring). It lists the shapes still on the sample view
  at the collection.

**The grid does not move with the sample during the scans**
- Look for `[UC] mesh axes before:` / `after:` in the log (`_run_collect_server`, one
  pair per scan). Non-zero `x/y/z` after the mesh mean the server rasters on them, which
  the overlay follows. `xOffset + x` after the mesh should be the programmed `meshEnd`;
  if it is the opposite sign, the sign in `motor_positions_to_screen` must flip.

**The snapshots before the collection are dark, or missing**
- `Collection: N crystal snapshot(s)` gives the count; 0 or 1 instead of 2 means
  `num_snapshots` did not reach the acquisition parameters.
- Each snapshot logs `[UC] snapshot <file>: phase …, N bytes`. A UI-log warning "did
  not reach the centring phase" means the supervisor refused the phase change.
- Look for `PX1TangoLight: light a -> b (zoom)` just before them. The level is always
  sent and waited for (3 s at most). `b` far from the zoom's `lightLevel` (`zoom.xml`)
  means the light did not get there: check the light device.

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
