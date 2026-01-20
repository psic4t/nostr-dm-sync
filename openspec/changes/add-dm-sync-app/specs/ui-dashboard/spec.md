# UI Dashboard Capability

## ADDED Requirements

### Requirement: Login Screen

The system SHALL display a login screen when the user is not authenticated.

#### Scenario: Display login options

- **WHEN** the user is not authenticated
- **THEN** the system SHALL display:
  - Application title "nostr-dm-sync"
  - Brief description of the application's purpose
  - "Login with Extension" button (if NIP-07 detected)
  - "Login with Amber" button (always visible)

#### Scenario: Show NIP-07 detection status

- **WHEN** NIP-07 is not detected
- **THEN** the "Login with Extension" button SHALL be disabled or hidden
- **AND** a message MAY indicate that no extension was found

### Requirement: Dashboard Layout

The system SHALL display a dashboard after successful authentication.

#### Scenario: Display user info

- **WHEN** the user is authenticated
- **THEN** the system SHALL display:
  - The user's public key (truncated npub format)
  - A logout button

#### Scenario: Display loading state

- **WHEN** messaging relays are being discovered
- **THEN** the system SHALL display a loading indicator
- **AND** show status text like "Discovering messaging relays..."

#### Scenario: Display no relays configured

- **WHEN** no kind 10050 event is found
- **THEN** the system SHALL display a message explaining that no messaging relays are configured
- **AND** suggest configuring relays in a Nostr client

### Requirement: Relay List Display

The system SHALL display all messaging relays with their status and statistics.

#### Scenario: Display relay cards

- **WHEN** messaging relays have been discovered
- **THEN** the system SHALL display a card for each relay containing:
  - Relay URL
  - Connection status indicator (connected, disconnected, error)
  - Total message count for this relay
  - Unique message count for this relay
  - Sync button (if unique messages exist)

#### Scenario: Display connection status colors

- **WHEN** displaying relay connection status
- **THEN** the system SHALL use visual indicators:
  - Green indicator for connected
  - Yellow indicator for connecting
  - Red indicator for error
  - Gray indicator for disconnected

#### Scenario: Display fetching state

- **WHEN** messages are being fetched from a relay
- **THEN** the system SHALL display a loading spinner or progress indicator
- **AND** show "Fetching messages..." text

### Requirement: Relay Card Interactions

The system SHALL support user interactions with relay cards.

#### Scenario: Sync button click

- **WHEN** the user clicks the "Sync" button on a relay card
- **THEN** the system SHALL open the sync modal
- **AND** begin syncing that relay's unique messages

#### Scenario: Sync button shows count

- **WHEN** a relay has unique messages
- **THEN** the sync button SHALL display the count (e.g., "Sync 12 messages")

### Requirement: Sync Modal Display

The system SHALL display a modal during sync operations.

#### Scenario: Modal overlay

- **WHEN** the sync modal is open
- **THEN** the system SHALL display:
  - A semi-transparent overlay covering the dashboard
  - A centered modal dialog
  - The source relay being synced from

#### Scenario: Modal progress display

- **WHEN** sync is in progress
- **THEN** the modal SHALL display:
  - Progress bar showing overall completion
  - "Syncing X of Y messages" text
  - List of target relays with individual status

#### Scenario: Modal completion display

- **WHEN** sync completes
- **THEN** the modal SHALL display:
  - Summary of successful syncs
  - Any errors that occurred
  - "Close" button enabled

### Requirement: Responsive Design

The system SHALL be usable on both desktop and mobile devices.

#### Scenario: Mobile layout

- **WHEN** viewed on a mobile device (narrow viewport)
- **THEN** relay cards SHALL stack vertically
- **AND** all interactive elements SHALL be touch-friendly (minimum 44px tap targets)

#### Scenario: Desktop layout

- **WHEN** viewed on a desktop device (wide viewport)
- **THEN** relay cards MAY display in a grid layout
- **AND** the interface SHALL make efficient use of available space

### Requirement: Error Display

The system SHALL display errors to the user in a clear manner.

#### Scenario: Display connection error

- **WHEN** a relay connection fails
- **THEN** the system SHALL display an error message on the relay card
- **AND** offer a retry option if applicable

#### Scenario: Display auth error

- **WHEN** authentication fails
- **THEN** the system SHALL display an error message
- **AND** return to the login screen if the error is unrecoverable
