# Message Discovery Capability

## ADDED Requirements

### Requirement: Fetch User Messaging Relays

The system SHALL fetch the user's preferred messaging relays from their kind 10050 event.

#### Scenario: Query kind 10050 from default relays

- **WHEN** the user is authenticated
- **THEN** the system SHALL query default relays for kind 10050 events authored by the user
- **AND** use the filter `{kinds: [10050], authors: [<user-pubkey>], limit: 1}`

#### Scenario: Extract relay URLs from kind 10050

- **WHEN** a kind 10050 event is received
- **THEN** the system SHALL extract all `["relay", "<url>"]` tags
- **AND** store the relay URLs as the user's messaging relays

#### Scenario: No kind 10050 found

- **WHEN** no kind 10050 event is found on any default relay
- **THEN** the system SHALL display a message indicating no messaging relays are configured
- **AND** suggest the user configure their relays in a Nostr client

#### Scenario: Multiple kind 10050 events

- **WHEN** multiple kind 10050 events are received
- **THEN** the system SHALL use the event with the highest `created_at` timestamp

### Requirement: Fetch Gift-Wrapped Messages

The system SHALL fetch all gift-wrapped messages (kind 1059) addressed to the user from each messaging relay.

#### Scenario: Query kind 1059 from messaging relay

- **WHEN** connected to a messaging relay
- **THEN** the system SHALL query for kind 1059 events where the user is p-tagged
- **AND** use the filter `{kinds: [1059], #p: [<user-pubkey>], limit: 1000}`

#### Scenario: Store messages by relay

- **WHEN** kind 1059 events are received from a relay
- **THEN** the system SHALL store each event associated with its source relay
- **AND** track the event ID for uniqueness comparison

#### Scenario: Handle large message count

- **WHEN** a relay returns 1000 events (the limit)
- **THEN** the system SHALL indicate that more messages may exist
- **AND** display the count with a "+" indicator (e.g., "1000+")

### Requirement: Calculate Message Statistics

The system SHALL calculate total and unique message counts for each relay.

#### Scenario: Calculate total messages per relay

- **WHEN** all messages have been fetched from a relay
- **THEN** the system SHALL count the total number of distinct event IDs from that relay

#### Scenario: Calculate unique messages per relay

- **WHEN** messages have been fetched from all messaging relays
- **THEN** the system SHALL calculate which event IDs exist only on a single relay
- **AND** a message is "unique to relay X" if it exists on relay X but not on any other messaging relay

#### Scenario: Update statistics on relay connection

- **WHEN** a new relay connects and returns messages
- **THEN** the system SHALL recalculate unique message counts for all relays
