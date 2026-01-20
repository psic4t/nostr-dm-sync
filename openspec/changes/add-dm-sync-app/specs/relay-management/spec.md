# Relay Management Capability

## ADDED Requirements

### Requirement: Default Relay Configuration

The system SHALL maintain a set of default relays used for discovering user metadata.

#### Scenario: Default relays defined

- **WHEN** the application initializes
- **THEN** the system SHALL have the following default relays configured:
  - `wss://purplepag.es`
  - `wss://nos.lol`
  - `wss://relay.damus.io`
  - `wss://nostr.data.haus`

### Requirement: WebSocket Relay Connection

The system SHALL establish and manage WebSocket connections to Nostr relays.

#### Scenario: Connect to relay

- **WHEN** a relay connection is requested
- **THEN** the system SHALL open a WebSocket connection to the relay URL
- **AND** track the connection status (connecting, connected, disconnected, error)

#### Scenario: Connection failure

- **WHEN** a WebSocket connection fails or times out
- **THEN** the system SHALL mark the relay status as "error"
- **AND** continue operating with other connected relays

#### Scenario: Connection close

- **WHEN** a relay WebSocket connection closes
- **THEN** the system SHALL update the relay status to "disconnected"

### Requirement: Relay Subscription Management

The system SHALL support creating and managing Nostr subscriptions (REQ/CLOSE).

#### Scenario: Create subscription

- **WHEN** a subscription is requested with filters
- **THEN** the system SHALL send a REQ message with a unique subscription ID
- **AND** process incoming EVENT messages matching the subscription

#### Scenario: Close subscription

- **WHEN** a subscription is closed
- **THEN** the system SHALL send a CLOSE message with the subscription ID

#### Scenario: Subscription end of stored events

- **WHEN** the relay sends an EOSE message for a subscription
- **THEN** the system SHALL notify listeners that historical events are complete

### Requirement: NIP-42 Authentication Support

The system SHALL support NIP-42 relay authentication when relays require it.

#### Scenario: Receive AUTH challenge

- **WHEN** a relay sends an AUTH message with a challenge string
- **THEN** the system SHALL store the challenge for that relay

#### Scenario: Handle auth-required response

- **WHEN** a relay responds with "auth-required" to a REQ or EVENT
- **AND** a challenge has been received
- **THEN** the system SHALL create a kind 22242 auth event with:
  - `["relay", "<relay-url>"]` tag
  - `["challenge", "<challenge-string>"]` tag
- **AND** request the signer to sign it
- **AND** send the signed event as an AUTH message
- **AND** retry the original request after successful authentication

#### Scenario: AUTH success

- **WHEN** the relay responds with OK to an AUTH message
- **THEN** the system SHALL mark the relay as authenticated
- **AND** proceed with pending requests

### Requirement: Event Publishing

The system SHALL support publishing events to relays.

#### Scenario: Publish event to relay

- **WHEN** an event is published to a relay
- **THEN** the system SHALL send an EVENT message containing the event
- **AND** wait for the OK response

#### Scenario: Publish success

- **WHEN** the relay responds with `["OK", "<event-id>", true, ...]`
- **THEN** the system SHALL report the publish as successful

#### Scenario: Publish failure

- **WHEN** the relay responds with `["OK", "<event-id>", false, "<reason>"]`
- **THEN** the system SHALL report the publish as failed with the reason
