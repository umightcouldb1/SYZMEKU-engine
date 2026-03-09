# BIG SYZ / SYZMEKU

## Master Build Spec

### Product Identity

**Big SYZ** is the user-facing, emotionally intelligent mentor platform.  
**SYZMEKU** is the secure technical engine that powers Big SYZ.

### Core Principle

Emotions are **indicators**, not commands.  
The system interprets emotional states as signal data and responds with empathy, clarity, and non-harmful guidance.

### Non-Negotiable Rule

Do no harm:

- to self
- to others
- through system output
- through system automation

---

## 1. PRODUCT STRUCTURE

### 1.1 Big SYZ

User-facing layer.

Purpose:

- mentor
- guide
- reflect
- help pattern recognition
- help planning
- provide emotionally intelligent support

Tone:

- warm
- clear
- non-clinical
- supportive
- development-oriented
- easy to understand across ages

Primary UX:

- chat-first
- guided check-ins
- simple insights
- focus for today
- growth path

### 1.2 SYZMEKU Engine

Technical engine layer.

Purpose:

- context assembly
- signal analysis
- memory
- reasoning
- orchestration
- task creation
- alerts
- protocol execution
- loop state
- audit and security logic

Tone:

- technical
- structured
- invisible to normal users
- visible in Operator Mode

### 1.3 User Modes

#### Mentor Mode

Default for normal users.

Should show:

- Today’s Insight
- Quick Check-In
- Ask Big SYZ
- Focus for Today
- Progress Path

Should hide:

- agent loop internals
- kernel routes
- node labels
- raw task IDs
- raw alerts count
- technical telemetry

#### Operator Mode

Advanced mode for founder/admin/operator.

Should show:

- state chips
- agent loop controls
- alerts
- tasks
- memory status
- context status
- mode status
- protocol status
- reasoning summaries
- action history
- debug and operational controls

---

## 2. SYSTEM ARCHITECTURE

### 2.1 Core Layers

#### Perception Layer

Inputs:

- conversational chat
- command input
- daily check-ins
- signals
- systems
- tasks
- files
- screenshots/images
- voice
- future: calendar and external tools

#### State Layer

Stores:

- session memory
- strategic memory
- loop state
- current mode
- current alerts
- open tasks
- last reasoning result
- last action result

#### Reasoning Kernel

Responsibilities:

- observe all current context
- interpret patterns
- assign urgency
- choose mode
- choose node
- generate reasoning summary
- generate next actions

#### Specialist Nodes

Required nodes:

- Sentinel Node
- Mentor Node
- Planner Node
- Protocol Node
- Recommend Node

#### Action Kernel

Responsibilities:

- convert reasoning into action
- decide whether to create tasks
- decide whether to create alerts
- decide whether to run a protocol
- save memory entries
- verify action outcomes

#### Autonomous Loop

Responsibilities:

- run on interval
- load context
- run reasoning kernel
- run action kernel
- store results
- update state
- continue on error

#### Operator UI

Responsibilities:

- show current state
- show latest reasoning summary
- show current mode
- show current alerts/tasks
- expose loop controls
- expose recent actions
- preserve advanced command console

---

## 3. REQUIRED DATA MODELS

These models must exist and be used consistently.

### 3.1 User

Fields:

- id
- email
- password_hash
- role
- plan_tier
- created_at
- updated_at
- mfa_enabled
- profile_metadata

Roles:

- founder
- admin
- user
- clinician
- support

### 3.2 SignalEntry

Fields:

- user_id
- sleep
- stress
- energy
- mood
- symptoms
- notes
- created_at
- updated_at

### 3.3 System

Fields:

- user_id
- name
- purpose
- inputs
- outputs
- routines
- protocol_type
- protocol_rules
- recommended_actions
- trigger_conditions
- automation_enabled
- escalation_level
- created_at
- updated_at

### 3.4 Task

Fields:

- user_id
- description
- status
- source
- created_at
- completed_at
- updated_at

Status:

- open
- done

### 3.5 Alert

Fields:

- user_id
- title
- severity
- summary
- source
- active
- created_at
- updated_at

Severity:

- low
- medium
- high

### 3.6 StrategicMemory

Fields:

- user_id
- title
- category
- content
- source_command
- tags
- created_at
- updated_at

### 3.7 AgentLoopState

Fields:

- singleton_key
- active
- interval_ms
- last_run_at
- run_count
- last_error
- latest_agent_summary
- latest_agent_mode
- latest_agent_next_actions
- updated_at

### 3.8 AgentCycleLog

Fields:

- timestamp
- operator_state_summary
- urgency_score
- dominant_mode
- selected_node
- reasoning_summary
- next_actions
- tasks_created
- alerts_created
- protocol_run
- success
- error

### 3.9 ActionLog

Fields:

- action_name
- input
- result
- success
- error
- timestamp

---

## 4. SECURITY AND COMPLIANCE BUILD REQUIREMENTS

### 4.1 Authentication

Must include:

- hashed passwords only
- secure session handling
- session expiration
- logout/session revoke
- role-based access
- optional MFA

### 4.2 Access Control

Every user-scoped query must filter by user identity.

No broad unrestricted reads.

### 4.3 Encryption

Must support:

- HTTPS in transit
- encryption at rest for sensitive data
- field-level protection for highly sensitive data

Sensitive categories include:

- signals
- symptoms
- emotional notes
- health-adjacent logs
- mentor reflections tied to identifiable users

### 4.4 Audit Logging

Must log:

- login
- logout
- data access
- task creation/completion
- alert creation/update
- protocol runs
- loop start/stop
- agent actions
- memory saves

### 4.5 Privacy Controls

Users must eventually have:

- data export
- data deletion request path
- visibility into what is stored
- optional research sharing controls

### 4.6 Safety Policy Layer

The engine must enforce:

- emotions are indicators, not commands
- no harmful self/other guidance
- no diagnostic claims
- no treatment claims
- distress-sensitive supportive responses
- escalation logic for concerning patterns

---

## 5. BIG SYZ USER EXPERIENCE

### 5.1 Default Screen

Big SYZ opens in Mentor Mode by default.

Show these blocks:

#### Today’s Insight

One clear sentence.

#### Quick Check-In

Inputs:

- sleep
- stress
- energy
- mood
- symptoms

Button:

- Analyze my state

#### Ask Big SYZ

Single conversational input.
Placeholder:

- What do you need help with today?

#### Focus for Today

Top 3 actionable items.

#### Progress Path

Current developmental tier and what unlocks next.

### 5.2 Language Rules

Do not expose internal terms to regular users:

- node
- kernel
- loop
- route
- protocol status
- urgency score

Translate them into:

- insight
- focus
- pattern
- guidance
- next step
- support

### 5.3 Emotional Intelligence Rules

Response structure should be:

1. acknowledge
2. interpret
3. guide

Example pattern:

- “It sounds like today feels heavier than usual.”
- “Your recent sleep and stress signals suggest rising load.”
- “Let’s reduce complexity and focus on one thing first.”

---

## 6. OPERATOR MODE REQUIREMENTS

### 6.1 Keep Existing Advanced Aesthetic

Do not remove the current advanced visual style.

### 6.2 Top Status Chips

These must become functional controls, not passive badges.

Click behavior:

- Memory Active → MEMORY STATUS
- Context Loaded → CONTEXT STATUS
- Mode → MODE STATUS
- Alerts → SYSTEM ALERTS
- Tasks → TASK LIST
- Autonomy → AUTONOMY STATUS
- Agent Loop → AGENT LOOP STATUS

### 6.3 Live Operator Panel

Must display:

- latest reasoning summary
- dominant mode
- selected node
- urgency score
- latest next actions
- latest alert summary
- open task count
- last loop run
- last action result

---

## 7. COMMAND SURFACE

### 7.1 Core

- analyze <text>
- recommend
- summary

### 7.2 Analyze Modes

- analyze strategic <text>
- analyze health <text>
- analyze build <text>
- analyze signal <text>

### 7.3 Mentor

- mentor <text>
- reflect <text>
- reframe <text>

### 7.4 Signals

- log signal ...
- show signals
- trend signals
- signal anomaly
- signal report

### 7.5 Systems

- create system <name>
- show systems
- run system <name>
- map systems
- automate system <name>
- disable system <name>
- protocol status

### 7.6 Tasks

- task create <text>
- task show
- task complete <id>
- save recommendation

### 7.7 Memory

- memory save <text>
- memory show
- memory search <query>
- history
- context

### 7.8 Agent / Planner

- agent <goal>
- execute <goal>
- orchestrate <goal>
- plan <goal>
- build <goal>
- agent evaluate

### 7.9 Autonomy

- loop start
- loop stop
- loop status
- alerts
- monitor run
- autonomy status
- kernel status
- kernel inspect

### 7.10 Perception

- analyze file
- analyze image
- voice on
- voice off

---

## 8. AUTONOMOUS REASONING KERNEL REQUIREMENTS

Each loop cycle must do all of the following:

1. load latest signals
2. load latest systems
3. load open tasks
4. load current alerts
5. load strategic memory
6. load recent command history
7. load last overlay result
8. build unified operator context
9. compute:
   - operator_state_summary
   - urgency_score
   - dominant_mode
   - selected_node
   - reasoning_summary
   - next_actions
   - should_create_task
   - should_create_alert
   - should_run_protocol
   - protocol_to_run
10. dispatch to the selected node
11. merge node response into final output
12. pass output to Action Kernel
13. save reasoning memory
14. log cycle result
15. update loop state

If a cycle fails:

- do not crash the loop
- save error
- continue next cycle

---

## 9. ACTION KERNEL REQUIREMENTS

The Action Kernel must:

1. read reasoning output
2. apply action policy
3. choose tools
4. execute tools
5. verify outcomes
6. persist action logs
7. update UI-visible state

Tool registry must include:

- createTask
- completeTask
- createAlert
- updateAlert
- runProtocol
- saveMemory
- generateReport

Action policies:

- low urgency → suggestion only
- medium urgency → task creation/update
- high urgency → alert creation/update
- repeated pattern → save memory
- protocol-safe case → run protocol

---

## 10. DEVELOPMENTAL PATH MODEL

Replace plain subscription language with growth paths.

### Initiate

- chat mentor
- simple check-ins
- basic insights
- short history

### Alignment

- stronger pattern recognition
- longer memory
- deeper recommendations
- stronger focus guidance

### Ascension

- advanced strategic reasoning
- protocol suggestions
- more personalized mentor support

### Mastery

- full pattern intelligence
- advanced planning
- richer memory
- premium tools/integrations

Internally these can still map to subscription tiers.

---

## 11. TESTING REQUIREMENTS

### 11.1 Functional Test Pass

Must verify:

- sign-up/login
- secure auth
- role restrictions
- signal logging
- signal retrieval
- system creation
- system retrieval
- task create/show/complete
- analyze
- recommend
- mentor
- agent
- planner
- loop start/stop/status
- alerts
- monitor run
- action logs
- memory save/show/search

### 11.2 Usability Test Pass

Test with family group across age range.

Success criteria:

- user can understand what to do without training
- user can complete check-in
- user can ask a question naturally
- user can find today’s insight
- user can understand focus items
- user is not forced to understand technical terms

### 11.3 Founder Test Pass

Operator Mode must let you:

- inspect live state
- inspect loop state
- inspect alerts/tasks
- inspect memory/context
- manually run evaluate/monitor
- verify autonomous behavior

---

## 12. DELIVERY PHASES

### Phase A — Security + Identity

Build:

- real auth
- sessions
- RBAC
- MFA-ready foundation
- audit logging

### Phase B — UX Split

Build:

- Big SYZ Mentor Mode default
- Operator Mode preserved
- clickable status chips
- live operator panel

### Phase C — Kernel Completion

Build:

- full autonomous reasoning kernel
- action kernel
- action history
- visible reasoning summaries

### Phase D — Perception + Guidance

Build:

- check-in UX
- conversational input
- file/image
- voice layer

### Phase E — Compliance Hardening

Build:

- encryption hardening
- privacy/export/delete flows
- incident handling structure
- legal/compliance scaffolding

---

## 13. PRODUCT RULES

1. Big SYZ is always emotionally intelligent.
2. SYZMEKU remains the technical engine.
3. Emotions are treated as indicators, not commands.
4. The platform does no harm.
5. The system should be simple for normal users, powerful for operators.
6. The advanced architecture must remain intact under the simplified interface.
7. No new feature should break the distinction between:
   - Big SYZ = Ironheart / emotional / mentor
   - SYZMEKU = Jarvis / technical / engine

---

## 14. FINAL PRODUCT STATEMENT

**Big SYZ is the emotionally intelligent mentor platform.**  
**It is powered by the SYZMEKU Engine.**  
**It helps users understand patterns in their lives, reflect clearly, and take aligned next steps — safely, securely, and intelligently.**

Use this as the controlling document going forward.
