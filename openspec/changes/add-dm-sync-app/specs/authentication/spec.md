# Authentication Capability

## ADDED Requirements

### Requirement: NIP-07 Browser Extension Authentication

The system SHALL support authentication via NIP-07 browser extensions (window.nostr) to obtain the user's public key and sign events.

#### Scenario: Detect NIP-07 availability

- **WHEN** the application loads in a browser
- **THEN** the system SHALL check for the presence of `window.nostr`
- **AND** display a "Login with Extension" button if available

#### Scenario: Successful NIP-07 login

- **WHEN** the user clicks "Login with Extension"
- **AND** a NIP-07 extension is available
- **THEN** the system SHALL call `window.nostr.getPublicKey()`
- **AND** store the returned hex pubkey in application state
- **AND** transition to the authenticated dashboard view

#### Scenario: NIP-07 login rejection

- **WHEN** the user clicks "Login with Extension"
- **AND** the user rejects the permission request in their extension
- **THEN** the system SHALL display an error message
- **AND** remain on the login screen

### Requirement: NIP-55 Amber Mobile Authentication

The system SHALL support authentication via NIP-55 (Amber signer) using the nostrsigner: URL scheme with callback URLs for mobile users.

#### Scenario: Initiate NIP-55 login

- **WHEN** the user clicks "Login with Amber"
- **THEN** the system SHALL redirect to `nostrsigner:?type=get_public_key&callbackUrl=<app-callback-url>`
- **AND** Amber SHALL open to request user approval

#### Scenario: Successful NIP-55 callback

- **WHEN** Amber redirects back to the callback URL with the pubkey
- **THEN** the system SHALL extract the pubkey from URL parameters
- **AND** store the pubkey in application state
- **AND** redirect to the main dashboard

#### Scenario: NIP-55 callback without pubkey

- **WHEN** the callback URL is accessed without a valid pubkey parameter
- **THEN** the system SHALL display an error message
- **AND** redirect to the login screen

### Requirement: Event Signing via Signer

The system SHALL use the authenticated signer to sign NIP-42 AUTH events when required by relays.

#### Scenario: Sign AUTH event with NIP-07

- **WHEN** a relay requires authentication
- **AND** the user logged in via NIP-07
- **THEN** the system SHALL call `window.nostr.signEvent()` with the kind 22242 auth event
- **AND** send the signed event to the relay

#### Scenario: Sign AUTH event with NIP-55

- **WHEN** a relay requires authentication
- **AND** the user logged in via NIP-55
- **THEN** the system SHALL redirect to Amber with `type=sign_event`
- **AND** process the signed event from the callback

### Requirement: Logout Functionality

The system SHALL allow users to log out and clear authentication state.

#### Scenario: User logout

- **WHEN** the user clicks the logout button
- **THEN** the system SHALL clear the stored pubkey
- **AND** close all relay connections
- **AND** return to the login screen
