# Message Sync Capability

## ADDED Requirements

### Requirement: Initiate Message Sync

The system SHALL allow users to sync messages unique to one relay to all other messaging relays.

#### Scenario: Sync button availability

- **WHEN** a relay has messages unique to it (count > 0)
- **THEN** the system SHALL display an enabled "Sync" button for that relay
- **AND** the button SHALL show the count of unique messages

#### Scenario: Sync button disabled

- **WHEN** a relay has no unique messages
- **THEN** the system SHALL display a disabled "Sync" button
- **OR** hide the button entirely

#### Scenario: Start sync process

- **WHEN** the user clicks the "Sync" button for a relay
- **THEN** the system SHALL open a sync modal
- **AND** begin syncing unique messages from that relay to all other messaging relays

### Requirement: Sync Execution

The system SHALL publish each unique message to all other messaging relays.

#### Scenario: Publish message to target relays

- **WHEN** syncing a message from source relay
- **THEN** the system SHALL publish the complete kind 1059 event to each target relay
- **AND** the event SHALL be published without modification

#### Scenario: Handle publish success

- **WHEN** a relay accepts a published event
- **THEN** the system SHALL mark that message as synced to that relay
- **AND** update the progress counter

#### Scenario: Handle publish failure

- **WHEN** a relay rejects a published event
- **THEN** the system SHALL record the failure reason
- **AND** continue with remaining messages and relays
- **AND** display the failure in the sync summary

#### Scenario: Handle relay requiring AUTH during sync

- **WHEN** publishing to a relay returns "auth-required"
- **THEN** the system SHALL perform NIP-42 authentication
- **AND** retry the publish after successful auth

### Requirement: Sync Progress Tracking

The system SHALL display real-time progress during the sync operation.

#### Scenario: Display overall progress

- **WHEN** a sync is in progress
- **THEN** the system SHALL display:
  - Source relay name
  - Total number of messages being synced
  - Number of messages completed
  - Progress bar or percentage

#### Scenario: Display per-relay status

- **WHEN** a sync is in progress
- **THEN** the system SHALL display each target relay with its status:
  - Pending (not started)
  - In progress (count of messages synced)
  - Completed (success count)
  - Error (with error message)

#### Scenario: Display sync completion

- **WHEN** all messages have been processed for all target relays
- **THEN** the system SHALL display a summary showing:
  - Total messages synced
  - Successful syncs per relay
  - Failed syncs per relay (if any)
- **AND** enable the "Close" button

### Requirement: Sync Modal Control

The system SHALL provide controls to manage the sync modal.

#### Scenario: Close modal during sync

- **WHEN** the user attempts to close the modal while sync is in progress
- **THEN** the system SHALL warn that sync is in progress
- **AND** offer options to cancel sync or continue

#### Scenario: Close modal after completion

- **WHEN** the user closes the modal after sync completion
- **THEN** the system SHALL refresh the message statistics
- **AND** recalculate unique message counts for all relays
