# SYZMEKU Mentor System Schema + API Map

This document maps mentor intake data into signal-loop architecture:

`User → Profile → Signals → Interpretation → Protocols → Tasks → Loop Monitoring`

## Collections

- `users` (existing auth identity)
- `mentor_profiles`
- `life_contexts`
- `behavioral_rhythms`
- `emotional_patterns`
- `color_profiles`
- `sensory_profiles`
- `symbolic_interests`
- `mentor_signals`
- `protocols`
- `user_protocol_states`
- `mentor_tasks`
- `mentor_messages`
- `loop_statuses`

## API Endpoints

Mounted at `/api/mentor-system`.

### Intake
- `POST /intake` upserts profile + intake modules.
- `GET /intake` fetches current intake modules for authenticated user.

### Signals
- `POST /signals` records a signal event (`stress`, `sleep`, etc).
- `GET /signals?signal_type=&limit=` fetches recent user signals.

### Protocols
- `POST /protocols` creates protocol templates.
- `GET /protocols` lists protocol templates.
- `POST /user-protocols` activates/updates a protocol for user.
- `GET /user-protocols` reads user protocol state.

### Tasks
- `POST /tasks` creates execution tasks.
- `GET /tasks?status=` lists user tasks.

### Mentor Messages
- `POST /messages` writes mentor/reflection/insight message.
- `GET /messages?limit=` retrieves recent messages.

### Loop Status
- `POST /loop-status` upserts loop run state.
- `GET /loop-status` retrieves current loop run state.

## Notes

- All routes are `protect`-guarded and scoped to authenticated `req.user.id`.
- The model set is modular so Sentinel and future protocols can subscribe to `mentor_signals` without schema redesign.
